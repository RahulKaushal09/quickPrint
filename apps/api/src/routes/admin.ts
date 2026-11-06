// Platform admin: onboard shops, set fees and Razorpay Route accounts, see the whole fleet.

import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { PAID_STATUSES } from '@quickprint/shared';
import { HttpError, requireAdmin, requireUser } from '../auth';
import { config } from '../config';
import { ONLINE_WINDOW_MS } from '../hub';
import { randomCode } from '../jobs';
import { Device, Job, Shop, User } from '../models';

export const adminRoutes = Router();
adminRoutes.use(requireUser, requireAdmin);

const paise = z.number().int().min(50).max(100_000);
const fee = z.object({ type: z.enum(['percent', 'flat']), value: z.number().int().min(0).max(100_000) });

adminRoutes.get('/shops', async (_req, res) => {
  const since30 = new Date(Date.now() - 30 * 86400_000);
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [shops, online, volume, owners] = await Promise.all([
    Shop.find().sort({ createdAt: -1 }).lean(),
    Device.distinct('shopId', { revoked: false, online: true, lastSeenAt: { $gte: onlineSince } }),
    Job.aggregate([
      { $match: { 'payment.paidAt': { $gte: since30 }, status: { $in: [...PAID_STATUSES].filter((s) => s !== 'refunded') } } },
      { $group: { _id: '$shopId', jobs: { $sum: 1 }, revenue: { $sum: '$total' }, fees: { $sum: '$platformFee' } } },
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
      last30: vol.get(String(s._id)) ?? { jobs: 0, revenue: 0, fees: 0 },
      owner: ownerOf.get(String(s._id)) ?? null,
      qrUrl: `${config.webUrl}/s/${s.code}`,
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
      fee: fee.optional(),
      razorpayAccountId: z.string().trim().max(40).default(''),
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
    fee: body.fee,
    razorpayAccountId: body.razorpayAccountId,
  });
  await User.create({ name: body.ownerName, phone: body.ownerPhone, passwordHash: await bcrypt.hash(body.ownerPassword, 10), role: 'owner', shopId: shop._id });
  res.status(201).json({ shop, qrUrl: `${config.webUrl}/s/${code}` });
});

adminRoutes.patch('/shops/:id', async (req, res) => {
  const body = z
    .object({ active: z.boolean(), fee, razorpayAccountId: z.string().trim().max(40), name: z.string().trim().min(2).max(80) })
    .partial()
    .parse(req.body);
  const shop = await Shop.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!shop) throw new HttpError(404, 'Shop not found');
  res.json({ shop });
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
      { $group: { _id: null, jobs: { $sum: 1 }, revenue: { $sum: '$total' }, fees: { $sum: '$platformFee' }, pages: { $sum: { $multiply: ['$file.pages', '$copies'] } } } },
    ]),
  ]);
  res.json({ shops, active, online: online.length, last30: agg[0] ?? { jobs: 0, revenue: 0, fees: 0, pages: 0 } });
});
