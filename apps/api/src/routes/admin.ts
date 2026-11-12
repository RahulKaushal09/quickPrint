// Platform admin: onboard shops and see the whole fleet.

import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { PAID_STATUSES } from '@seedhaprint/shared';
import { HttpError, requireAdmin, requireUser } from '../auth';
import { config } from '../config';
import { ONLINE_WINDOW_MS } from '../hub';
import { randomCode } from '../jobs';
import { Device, Job, Shop, User } from '../models';
import { subscriptionOf } from '../presenters';
import { endOfDayIST, extendPaidUntil } from '../subscription';

export const adminRoutes = Router();
adminRoutes.use(requireUser, requireAdmin);

const paise = z.number().int().min(50).max(100_000);

adminRoutes.get('/shops', async (_req, res) => {
  const since30 = new Date(Date.now() - 30 * 86400_000);
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [shops, online, volume, owners] = await Promise.all([
    Shop.find().sort({ createdAt: -1 }).lean(),
    Device.distinct('shopId', { revoked: false, online: true, lastSeenAt: { $gte: onlineSince } }),
    Job.aggregate([
      { $match: { 'payment.paidAt': { $gte: since30 }, status: { $in: [...PAID_STATUSES].filter((s) => s !== 'refunded') } } },
      { $group: { _id: '$shopId', jobs: { $sum: 1 }, revenue: { $sum: '$total' } } },
    ]),
    User.find({ role: 'owner' }).select('name phone shopId').lean(),
  ]);
  const onlineSet = new Set(online.map(String));
  const vol = new Map(volume.map((v) => [String(v._id), v]));
  const ownerOf = new Map(owners.map((o) => [String(o.shopId), o]));
  res.json({
    shops: shops.map((s) => ({
      ...s,
      id: String(s._id),
      online: onlineSet.has(String(s._id)),
      last30: vol.get(String(s._id)) ?? { jobs: 0, revenue: 0 },
      owner: ownerOf.get(String(s._id)) ?? null,
      qrUrl: `${config.webUrl}/s/${s.code}`,
      plan: subscriptionOf(s),
    })),
  });
});

adminRoutes.post('/shops', async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(80),
      area: z.string().trim().max(80).default(''),
      city: z.string().trim().max(60).default(''),
      phone: z.string().trim().max(20).default(''),
      ownerName: z.string().trim().min(2).max(60),
      ownerPhone: z.string().trim().regex(/^\d{10}$/, 'Owner phone must be 10 digits'),
      ownerPassword: z.string().min(6).max(100),
      rates: z.object({ bwPerPage: paise, colorPerPage: paise, colorEnabled: z.boolean() }).optional(),
      /** Monthly fee in paise; 0 = free. */
      fee: z.number().int().min(0).max(10_000_000).default(0),
      /** Days before the first payment is due. */
      trialDays: z.number().int().min(0).max(365).default(14),
    })
    .parse(req.body);
  if (await User.exists({ phone: body.ownerPhone })) throw new HttpError(409, 'That phone number already has an account');

  let code = randomCode(6);
  while (await Shop.exists({ code })) code = randomCode(6);
  const shop = await Shop.create({
    code,
    name: body.name,
    area: body.area,
    city: body.city,
    phone: body.phone || body.ownerPhone,
    rates: body.rates,
    subscription: { fee: body.fee, paidUntil: body.fee ? endOfDayIST(new Date(Date.now() + body.trialDays * 86400_000)) : undefined },
  });
  await User.create({ name: body.ownerName, phone: body.ownerPhone, passwordHash: await bcrypt.hash(body.ownerPassword, 10), role: 'owner', shopId: shop._id });
  res.status(201).json({ shop, qrUrl: `${config.webUrl}/s/${code}` });
});

adminRoutes.patch('/shops/:id', async (req, res) => {
  const body = z
    .object({ active: z.boolean(), name: z.string().trim().min(2).max(80) })
    .partial()
    .parse(req.body);
  const shop = await Shop.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!shop) throw new HttpError(404, 'Shop not found');
  res.json({ shop });
});

/** Change the monthly fee, or correct the paid-until date by hand. */
adminRoutes.patch('/shops/:id/subscription', async (req, res) => {
  const body = z
    .object({ fee: z.number().int().min(0).max(10_000_000), paidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date').nullable() })
    .partial()
    .parse(req.body);
  const shop = await Shop.findById(req.params.id);
  if (!shop) throw new HttpError(404, 'Shop not found');
  if (body.fee !== undefined) shop.set('subscription.fee', body.fee);
  if (body.paidUntil !== undefined) shop.set('subscription.paidUntil', body.paidUntil ? endOfDayIST(new Date(`${body.paidUntil}T12:00:00+05:30`)) : undefined);
  await shop.save();
  res.json({ shop, plan: subscriptionOf(shop) });
});

/** Record a payment: extends the plan and switches the shop back on at once. */
adminRoutes.post('/shops/:id/subscription/payments', async (req, res) => {
  const body = z
    .object({
      months: z.number().int().min(1).max(24),
      amount: z.number().int().min(0).max(100_000_000),
      method: z.enum(['upi', 'cash', 'bank', 'other']),
      note: z.string().trim().max(200).default(''),
    })
    .parse(req.body);
  const shop = await Shop.findById(req.params.id);
  if (!shop) throw new HttpError(404, 'Shop not found');
  const until = extendPaidUntil(shop.subscription.paidUntil, body.months);
  shop.set('subscription.paidUntil', until);
  shop.subscription.payments.push({ ...body, at: new Date(), until, by: req.session!.userId });
  await shop.save();
  res.status(201).json({ shop, plan: subscriptionOf(shop) });
});

adminRoutes.get('/stats', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86400_000);
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [shops, active, online, agg] = await Promise.all([
    Shop.countDocuments(),
    Shop.countDocuments({ active: true }),
    Device.distinct('shopId', { revoked: false, online: true, lastSeenAt: { $gte: onlineSince } }),
    Job.aggregate([
      { $match: { 'payment.paidAt': { $gte: since }, status: { $in: ['queued', 'sent', 'printing', 'printed', 'failed'] } } },
      { $group: { _id: null, jobs: { $sum: 1 }, revenue: { $sum: '$total' }, pages: { $sum: { $multiply: [{ $ifNull: ['$printPages', '$file.pages'] }, '$copies'] } } } },
    ]),
  ]);
  // Subscription money received this calendar month (India time), and how many shops are in each state.
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const monthStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 3600_000);
  const plans = await Shop.find().select('subscription').lean();
  const states = { free: 0, active: 0, due_soon: 0, grace: 0, off: 0 };
  let thisMonth = 0;
  for (const p of plans) {
    states[subscriptionOf(p).state]++;
    for (const pay of p.subscription?.payments ?? []) if (pay.at && pay.at >= monthStart) thisMonth += pay.amount ?? 0;
  }
  res.json({ shops, active, online: online.length, last30: agg[0] ?? { jobs: 0, revenue: 0, pages: 0 }, subscriptions: { thisMonth, states } });
});
