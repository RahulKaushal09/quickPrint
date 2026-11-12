// Shop owner dashboard. Every query is scoped to req.shopId.

import crypto from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { PAID_STATUSES } from '@seedhaprint/shared';
import { HttpError, requireShop, requireUser } from '../auth';
import { config } from '../config';
import { connectedHere, dispatchShop, ONLINE_WINDOW_MS, sendTestPage } from '../hub';
import { randomCode, refundJob, transition } from '../jobs';
import { Device, Job, PairCode, Shop, User } from '../models';
import { RazorpayError, verifyKeys } from '../payments';
import { shopJob } from '../presenters';
import { decrypt, encrypt } from '../secrets';
import { sendPrintFile } from '../storage';

export const shopRoutes = Router();
shopRoutes.use(requireUser, requireShop);

const startOfToday = () => {
  // Shops are in India; "today" is IST midnight regardless of server timezone.
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000);
};

async function myShop(id: string) {
  const shop = await Shop.findById(id);
  if (!shop) throw new HttpError(404, 'Shop not found');
  return shop;
}

function devicePublic(d: any) {
  const online = d.online && d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
  return { id: String(d._id), name: d.name, os: d.os, version: d.version, printers: d.printers, online: Boolean(online), lastSeenAt: d.lastSeenAt };
}

shopRoutes.get('/', async (req, res) => {
  const shop = await myShop(req.shopId!);
  const user = await User.findById(req.session!.userId).select('name phone role').lean();
  res.json({ shop, user, qrUrl: `${config.webUrl}/s/${shop.code}` });
});

shopRoutes.patch('/', async (req, res) => {
  const paise = z.number().int().min(0).max(100_000);
  const names = z.array(z.string().max(200)).max(20);
  const body = z
    .object({
      name: z.string().trim().min(2).max(80),
      area: z.string().trim().max(80),
      city: z.string().trim().max(60),
      phone: z.string().trim().max(20),
      accepting: z.boolean(),
      rates: z.object({ bwPerPage: paise.min(50), colorPerPage: paise.min(50), colorEnabled: z.boolean(), duplexEnabled: z.boolean() }),
      printers: z.object({ bw: names, color: names, duplex: names, photo: names.default([]) }),
      trays: z.array(z.object({ printer: z.string().min(1).max(200), docs: names, photos: names })).max(40),
      photos: z.object({ enabled: z.boolean(), size: z.enum(['35x45', '51x51']), paper: z.enum(['4x6', 'A4']), perSheet: z.number().int().min(1).max(60), price: paise.min(100) }),
      cash: z.object({ enabled: z.boolean(), autoPrint: z.boolean() }),
    })
    .partial()
    .parse(req.body);
  const shop = await myShop(req.shopId!);
  shop.set(body);
  await shop.save();
  if (body.printers || body.accepting) void dispatchShop(shop._id);
  res.json({ shop });
});

shopRoutes.get('/overview', async (req, res) => {
  const shopId = req.shopId!;
  const since = startOfToday();
  const [today, open, cashWaiting, devices] = await Promise.all([
    Job.aggregate([
      { $match: { shopId: new mongoose.Types.ObjectId(shopId), 'payment.paidAt': { $gte: since }, status: { $in: [...PAID_STATUSES] } } },
      {
        $group: {
          _id: null,
          jobs: { $sum: 1 },
          pages: { $sum: { $multiply: [{ $ifNull: ['$printPages', '$file.pages'] }, '$copies'] } },
          revenue: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 0, '$total'] } },
          failed: { $sum: { $cond: [{ $in: ['$status', ['failed']] }, 1, 0] } },
        },
      },
    ]),
    Job.countDocuments({ shopId, status: { $in: ['queued', 'sent', 'printing'] } }),
    Job.countDocuments({ shopId, status: 'awaiting_cash' }),
    Device.find({ shopId, revoked: false }).lean(),
  ]);
  const t = today[0] ?? { jobs: 0, pages: 0, revenue: 0, failed: 0 };
  res.json({ today: { jobs: t.jobs, pages: t.pages, revenue: t.revenue, failed: t.failed }, open, cashWaiting, devices: devices.map(devicePublic) });
});

shopRoutes.get('/jobs', async (req, res) => {
  const q = z
    .object({ status: z.enum(['active', 'done', 'issues', 'all']).default('all'), before: z.string().optional(), limit: z.coerce.number().min(1).max(100).default(40) })
    .parse(req.query);
  const filter: Record<string, unknown> = { shopId: req.shopId, status: { $ne: 'draft' } };
  if (q.status === 'active') filter.status = { $in: ['awaiting_cash', 'queued', 'sent', 'printing'] };
  if (q.status === 'done') filter.status = 'printed';
  if (q.status === 'issues') filter.status = { $in: ['failed', 'refunded'] };
  if (q.status === 'all') filter.status = { $nin: ['draft', 'expired'] };
  if (q.before) filter.createdAt = { $lt: new Date(q.before) };
  const jobs = await Job.find(filter).sort({ createdAt: -1 }).limit(q.limit);
  res.json({ jobs: jobs.map(shopJob) });
});

async function myJob(shopId: string, id: string) {
  const job = await Job.findOne({ _id: id, shopId });
  if (!job) throw new HttpError(404, 'Job not found');
  return job;
}

shopRoutes.post('/jobs/:id/cash-received', async (req, res) => {
  const job = await myJob(req.shopId!, String(req.params.id));
  const next = await transition(job._id, 'queued', { only: ['awaiting_cash'], note: 'Cash received by shop', set: { 'payment.paidAt': new Date() } });
  if (!next) throw new HttpError(409, 'This job is not waiting for cash');
  void dispatchShop(job.shopId);
  res.json({ job: shopJob(next) });
});

shopRoutes.post('/jobs/:id/cash-cancel', async (req, res) => {
  const job = await myJob(req.shopId!, String(req.params.id));
  const next = await transition(job._id, 'expired', { only: ['awaiting_cash'], note: 'Cancelled by shop' });
  if (!next) throw new HttpError(409, 'This job is not waiting for cash');
  res.json({ job: shopJob(next) });
});

shopRoutes.post('/jobs/:id/fail', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(2).max(200) }).parse(req.body);
  const job = await myJob(req.shopId!, String(req.params.id));
  const next = await transition(job._id, 'failed', { only: ['queued', 'sent', 'printing', 'printed'], note: `Shop: ${reason}`, set: { error: reason } });
  if (!next) throw new HttpError(409, 'This job can no longer be marked as failed');
  res.json({ job: shopJob(next) });
});

shopRoutes.post('/jobs/:id/retry', async (req, res) => {
  const job = await myJob(req.shopId!, String(req.params.id));
  if (!job.file.key) throw new HttpError(410, 'The file was already deleted');
  const next = await transition(job._id, 'queued', { only: ['failed'], note: 'Retry by shop', set: { error: '', waiting: '', deviceId: null, acceptedAt: null, triedPrinters: [] } });
  if (!next) throw new HttpError(409, 'Only failed jobs can be retried');
  void dispatchShop(job.shopId);
  res.json({ job: shopJob(next) });
});

shopRoutes.post('/jobs/:id/refund', async (req, res) => {
  const job = await myJob(req.shopId!, String(req.params.id));
  const next = await refundJob(job, 'Refunded by shop');
  if (!next) throw new HttpError(409, 'Mark the job as failed before refunding');
  res.json({ job: shopJob(next) });
});

shopRoutes.get('/jobs/:id/file', async (req, res) => {
  const job = await myJob(req.shopId!, String(req.params.id));
  if (!job.file.key) throw new HttpError(410, 'The file was already deleted');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(job.file.name)}.pdf"`);
  await sendPrintFile(res, job);
});

// ---------------------------------------------------------------- the shop's own Razorpay

async function paymentsView(shopId: string) {
  const shop = await Shop.findById(shopId).select('+razorpay.webhookSecret');
  if (!shop) throw new HttpError(404, 'Shop not found');
  const r = shop.razorpay;
  return {
    connected: Boolean(r.keyId),
    keyId: r.keyId,
    mode: r.keyId.startsWith('rzp_live_') ? 'live' : r.keyId ? 'test' : null,
    verifiedAt: r.verifiedAt,
    webhookUrl: `${config.apiUrl}/api/payments/webhook/${shop.code}`,
    webhookSecret: r.webhookSecret ? decrypt(r.webhookSecret) : '',
    webhookSeenAt: r.webhookSeenAt,
  };
}

shopRoutes.get('/payments', async (req, res) => {
  res.json(await paymentsView(req.shopId!));
});

shopRoutes.put('/payments', async (req, res) => {
  const body = z
    .object({
      keyId: z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, 'A Key ID starts with rzp_live_ or rzp_test_'),
      keySecret: z.string().trim().min(8, 'Paste the full Key Secret').max(200),
    })
    .parse(req.body);
  try {
    await verifyKeys(body);
  } catch (e) {
    if (e instanceof RazorpayError && e.status === 401) throw new HttpError(400, 'Razorpay did not accept these keys. Check the Key ID and Key Secret and try again.');
    throw new HttpError(502, 'Could not reach Razorpay to check these keys. Please try again.');
  }
  const shop = await Shop.findById(req.shopId).select('+razorpay.webhookSecret');
  if (!shop) throw new HttpError(404, 'Shop not found');
  shop.set({
    'razorpay.keyId': body.keyId,
    'razorpay.keySecret': encrypt(body.keySecret),
    'razorpay.verifiedAt': new Date(),
    // Kept when keys change, so the webhook set up in Razorpay keeps working.
    'razorpay.webhookSecret': shop.razorpay.webhookSecret || encrypt(crypto.randomBytes(24).toString('base64url')),
  });
  await shop.save();
  res.json(await paymentsView(req.shopId!));
});

shopRoutes.delete('/payments', async (req, res) => {
  await Shop.updateOne({ _id: req.shopId }, { $set: { razorpay: {} } });
  res.json(await paymentsView(req.shopId!));
});

// ---------------------------------------------------------------- shop PCs

shopRoutes.get('/devices', async (req, res) => {
  const devices = await Device.find({ shopId: req.shopId, revoked: false }).sort({ createdAt: 1 }).lean();
  res.json({ devices: devices.map(devicePublic) });
});

shopRoutes.post('/devices/pair-code', async (req, res) => {
  const code = randomCode(8);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await PairCode.create({ code, shopId: req.shopId, expiresAt });
  res.json({ code, expiresAt, server: config.apiUrl });
});

shopRoutes.delete('/devices/:id', async (req, res) => {
  await Device.updateOne({ _id: req.params.id, shopId: req.shopId }, { revoked: true, online: false });
  res.json({ ok: true });
});

shopRoutes.post('/devices/:id/test', async (req, res) => {
  const { printer } = z.object({ printer: z.string().min(1) }).parse(req.body);
  const device = await Device.findOne({ _id: req.params.id, shopId: req.shopId, revoked: false });
  if (!device) throw new HttpError(404, 'PC not found');
  const shop = await myShop(req.shopId!);
  if (!connectedHere(String(device._id)) || !sendTestPage(String(device._id), printer, shop.code)) {
    throw new HttpError(409, 'This PC is not connected right now');
  }
  res.json({ ok: true });
});
