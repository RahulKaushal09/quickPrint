// Customer-facing endpoints. No login: the shop code comes from the QR and
// the job ref is a long random id only the customer's browser knows.

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { LIMITS, quote } from '@seedhaprint/shared';
import { HttpError } from '../auth';
import { config } from '../config';
import { acceptedTypes, makePrintReady } from '../documents';
import { dispatchShop } from '../hub';
import { markPaid, newJobRef, randomCode } from '../jobs';
import { Job, Shop } from '../models';
import { checkoutSignatureValid, confirmPayment, createOrder, RazorpayError, shopKeys } from '../payments';
import { publicJob, publicShop } from '../presenters';
import { storage } from '../storage';

export const publicRoutes = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxFileBytes, files: 1 } });
const uploadLimit = rateLimit({ windowMs: 10 * 60_000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false });

async function shopByCode(code: string) {
  const shop = await Shop.findOne({ code: code.toUpperCase() });
  if (!shop || !shop.active) throw new HttpError(404, 'This QR code is not active');
  return shop;
}

async function jobByRef(ref: string) {
  const job = await Job.findOne({ ref });
  if (!job) throw new HttpError(404, 'Print job not found');
  return job;
}

publicRoutes.get('/config', (_req, res) => {
  res.json({
    accept: acceptedTypes(),
    limits: LIMITS,
  });
});

publicRoutes.get('/shops/:code', async (req, res) => {
  res.json(await publicShop(await shopByCode(req.params.code)));
});

/** Step 1: upload. Creates a draft job priced as 1 copy B/W; options are chosen at checkout. */
publicRoutes.post('/shops/:code/uploads', uploadLimit, upload.single('file'), async (req, res) => {
  const shop = await shopByCode(String(req.params.code));
  if (!shop.accepting) throw new HttpError(409, 'This shop is not taking print orders right now');
  if (!req.file) throw new HttpError(400, 'Choose a file to print');

  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 120); // multer decodes names as latin1
  const { pdf, pages } = await makePrintReady(req.file.buffer, name);

  const ref = newJobRef();
  const key = `jobs/${shop.code}/${ref}.pdf`;
  await storage.put(key, pdf, 'application/pdf');

  const q = quote(shop.rates, 'bw', pages, 1);
  const job = await Job.create({
    ref,
    shopId: shop._id,
    pickupCode: randomCode(4, '23456789'),
    file: { key, name, bytes: pdf.length, pages },
    mode: 'bw',
    copies: 1,
    rate: q.rate,
    total: q.total,
    events: [{ status: 'draft', note: 'Uploaded' }],
  });
  res.status(201).json(publicJob(job));
});

/** The print-ready PDF for the customer's preview. Only until they pay; the ref is known only to them. */
publicRoutes.get('/jobs/:ref/preview', async (req, res) => {
  const job = await jobByRef(req.params.ref);
  if (job.status !== 'draft' || !job.file.key) throw new HttpError(410, 'Preview is no longer available');
  res.setHeader('Content-Type', 'application/pdf');
  (await storage.stream(job.file.key)).pipe(res);
});

publicRoutes.get('/jobs/:ref', async (req, res) => {
  const job = await jobByRef(req.params.ref);
  const shop = await Shop.findById(job.shopId).select('name area code').lean();
  res.json(publicJob(job, shop ?? undefined));
});

/** Step 2: lock the options and open a payment order on the shop's own Razorpay account. */
publicRoutes.post('/jobs/:ref/checkout', async (req, res) => {
  const body = z
    .object({
      mode: z.enum(['bw', 'color']),
      copies: z.number().int().min(1).max(LIMITS.maxCopies),
      rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
    })
    .parse(req.body);
  const job = await jobByRef(String(req.params.ref));
  if (job.status !== 'draft') throw new HttpError(409, 'This job is already paid');
  const shop = await Shop.findById(job.shopId);
  if (!shop?.active || !shop.accepting) throw new HttpError(409, 'This shop is not taking print orders right now');
  const status = await publicShop(shop);
  if (!status.available[body.mode]) throw new HttpError(409, `The ${body.mode === 'color' ? 'colour' : 'black & white'} printer is offline right now. Please ask at the counter.`);

  const keys = await shopKeys(shop._id);
  if (!keys && !config.allowTestCheckout) throw new HttpError(409, 'This shop has not set up online payments yet. Please ask at the counter.');

  let q;
  try {
    q = quote(shop.rates, body.mode, job.file.pages, body.copies);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  let order;
  try {
    order = await createOrder(keys, { receipt: job.ref, amount: q.total, notes: { jobRef: job.ref, shop: shop.code } });
  } catch (e) {
    if (e instanceof RazorpayError) throw new HttpError(502, 'Payment could not be started. Please ask the shop for help.');
    throw e;
  }
  job.set({ mode: body.mode, copies: body.copies, rotation: body.rotation, rate: q.rate, total: q.total, payment: { orderId: order.id, mock: order.mock } });
  await job.save();

  res.json({
    orderId: order.id,
    amount: q.total,
    currency: 'INR',
    mock: order.mock,
    keyId: keys?.keyId,
    shopName: shop.name,
    description: `${q.sheets} page${q.sheets > 1 ? 's' : ''} · ${body.mode === 'color' ? 'Colour' : 'B/W'}`,
  });
});

async function afterPaid(jobId: unknown, shopId: unknown) {
  await dispatchShop(String(shopId)).catch((e) => console.error('[dispatch]', e));
  return Job.findById(jobId);
}

/** Step 3a: Razorpay checkout returned. Signature proves it came from Razorpay. */
publicRoutes.post('/jobs/:ref/verify', async (req, res) => {
  const body = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() }).parse(req.body);
  const job = await jobByRef(String(req.params.ref));
  if (job.payment?.orderId !== body.orderId) throw new HttpError(400, 'Payment does not match this job');
  if (job.status === 'draft' || job.status === 'expired') {
    const keys = await shopKeys(job.shopId);
    if (!keys || !checkoutSignatureValid(keys.keySecret, body.orderId, body.paymentId, body.signature)) throw new HttpError(400, 'Payment could not be verified');
    if (!(await confirmPayment(keys, body.orderId, body.paymentId, job.total))) throw new HttpError(402, 'Payment is not complete yet');
    await markPaid(job, body.paymentId);
  }
  res.json(publicJob((await afterPaid(job._id, job.shopId))!));
});

/** Step 3b: test checkout, only where ALLOW_TEST_CHECKOUT permits and the order is a mock one. */
publicRoutes.post('/jobs/:ref/mock-pay', async (req, res) => {
  if (!config.allowTestCheckout) throw new HttpError(404, 'Not found');
  const job = await jobByRef(String(req.params.ref));
  if (!job.payment?.orderId || !job.payment.mock) throw new HttpError(400, 'Start checkout first');
  if (job.status === 'draft' || job.status === 'expired') await markPaid(job, `mock_pay_${Date.now()}`);
  res.json(publicJob((await afterPaid(job._id, job.shopId))!));
});
