// Customer-facing endpoints. No login: the shop code comes from the QR and
// the job ref is a long random id only the customer's browser knows.

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { LIMITS, photoSheets, quote, type PhotoPaper, type PhotoSize } from '@seedhaprint/shared';
import { HttpError } from '../auth';
import { config } from '../config';
import { acceptedTypes, appendPdf, makePrintReady, normalizePhoto, photoSheet } from '../documents';
import { dispatchShop } from '../hub';
import { markPaid, newJobRef, randomCode, transition } from '../jobs';
import { Job, Shop } from '../models';
import { checkoutSignatureValid, confirmPayment, createOrder, RazorpayError, shopKeys } from '../payments';
import { photoPacks, publicJob, publicShop, shopCanSell } from '../presenters';
import { readAll, storage } from '../storage';

export const publicRoutes = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxFileBytes, files: 1 } });
const uploadLimit = rateLimit({ windowMs: 10 * 60_000, limit: 150, standardHeaders: 'draft-8', legacyHeaders: false });

async function shopByCode(code: string) {
  const shop = await Shop.findOne({ code: code.toUpperCase() });
  if (!shop || !shop.active) throw new HttpError(404, 'This QR code is not active');
  if (!shopCanSell(shop)) throw new HttpError(403, 'This shop is not taking orders here right now. Please ask at the counter.');
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
/** Passport photos: one picture, cropped and laid out at checkout. */
publicRoutes.post('/shops/:code/photo', uploadLimit, upload.single('file'), async (req, res) => {
  const shop = await shopByCode(String(req.params.code));
  const cheapest = photoPacks(shop.photos)[0];
  if (!shop.accepting || !shop.photos.enabled || !cheapest) throw new HttpError(409, 'This shop is not making passport photos right now');
  if (!req.file) throw new HttpError(400, 'Choose or take a photo');
  const { jpeg } = await normalizePhoto(req.file.buffer);
  const ref = newJobRef();
  const key = `jobs/${shop.code}/${ref}.jpg`;
  await storage.put(key, jpeg, 'image/jpeg');
  const job = await Job.create({
    ref,
    shopId: shop._id,
    kind: 'photo',
    pickupCode: randomCode(4, '23456789'),
    file: { key, sourceKey: key, name: 'Passport photos', bytes: jpeg.length, pages: 1 },
    mode: 'color',
    copies: 1,
    // Priced for real at checkout, once the customer picks how many.
    rate: cheapest.price,
    total: cheapest.price,
    events: [{ status: 'draft', note: 'Photo uploaded' }],
  });
  res.status(201).json(publicJob(job));
});

/** The upright picture to crop, until the order is placed. */
publicRoutes.get('/jobs/:ref/photo', async (req, res) => {
  const job = await jobByRef(req.params.ref);
  if (job.kind !== 'photo' || job.status !== 'draft' || !job.file.sourceKey) throw new HttpError(410, 'This photo is no longer available');
  res.setHeader('Content-Type', 'image/jpeg');
  (await storage.stream(job.file.sourceKey)).pipe(res);
});

/** Add another PDF or photo to an unpaid job. Files arrive one at a time, so a small server stays comfortable. */
publicRoutes.post('/jobs/:ref/files', uploadLimit, upload.single('file'), async (req, res) => {
  const job = await jobByRef(String(req.params.ref));
  if (job.status !== 'draft' || !job.file.key || job.kind === 'photo') throw new HttpError(409, 'This job can no longer be changed');
  if (!req.file) throw new HttpError(400, 'Choose a file to print');
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 120);
  const { pdf: added, pages } = await makePrintReady(req.file.buffer, name);
  if (job.file.pages + pages > LIMITS.maxPages) throw new HttpError(422, `Documents are limited to ${LIMITS.maxPages} pages.`);
  const merged = await appendPdf(await readAll(job.file.key), added);
  if (merged.length > LIMITS.maxTotalBytes) throw new HttpError(413, 'That is too much for one order. Please print the rest as a new order.');
  await storage.put(job.file.key, merged, 'application/pdf');
  job.set({ 'file.pages': job.file.pages + pages, 'file.bytes': merged.length });
  await job.save();
  res.json(publicJob(job));
});

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

const turnSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const fraction = z.number().min(0).max(1);

/** Step 2: lock the options, then open a payment order or place a cash order. */
publicRoutes.post('/jobs/:ref/checkout', async (req, res) => {
  const base = z.object({ method: z.enum(['online', 'cash']).default('online'), copies: z.number().int().min(1).max(LIMITS.maxCopies) }).parse(req.body);
  const job = await jobByRef(String(req.params.ref));
  if (job.status !== 'draft') throw new HttpError(409, 'This job is already placed');
  const shop = await Shop.findById(job.shopId);
  if (!shop || !shopCanSell(shop) || !shop.accepting) throw new HttpError(409, 'This shop is not taking print orders right now');
  const status = await publicShop(shop);

  let options: Record<string, unknown>;
  let total: number;
  let description: string;
  if (job.kind === 'photo') {
    if (!status.photos) throw new HttpError(409, 'This shop is not making passport photos right now');
    if (!status.photos.available) throw new HttpError(409, 'The photo printer is offline right now. Please ask at the counter.');
    const body = z.object({ count: z.number().int().min(1), turn: turnSchema.default(0), crop: z.object({ x: fraction, y: fraction, w: fraction, h: fraction }) }).parse(req.body);
    const pack = photoPacks(shop.photos).find((p) => p.count === body.count);
    if (!pack) throw new HttpError(400, 'That number of photos is not available. Please choose again.');
    const paper = shop.photos.paper as PhotoPaper;
    const size = shop.photos.size as PhotoSize;
    const sheets = photoSheets(paper, size, pack.count);
    const pdf = await photoSheet(await readAll(job.file.sourceKey!), body.crop, body.turn, paper, size, sheets);
    const key = `jobs/${shop.code}/${job.ref}.pdf`;
    await storage.put(key, pdf, 'application/pdf');
    total = Math.max(LIMITS.minTotal, pack.price);
    description = `Passport photos · ${pack.count} photos`;
    options = {
      'file.key': key,
      'file.bytes': pdf.length,
      'file.pages': sheets.length,
      photo: { size, paper, count: pack.count, sheets, perSheet: Math.max(...sheets) },
      mode: 'color',
      sides: 'single',
      copies: 1,
      pageList: [],
      printPages: sheets.length,
      rate: pack.price,
      total,
    };
  } else {
    const body = z
      .object({
        mode: z.enum(['bw', 'color']),
        sides: z.enum(['single', 'double']).default('single'),
        pages: z
          .array(z.object({ p: z.number().int().min(1), r: turnSchema }))
          .min(1, 'Choose at least one page to print')
          .max(LIMITS.maxPages),
      })
      .parse(req.body);
    if (body.pages.some((c) => c.p > job.file.pages) || new Set(body.pages.map((c) => c.p)).size !== body.pages.length) throw new HttpError(400, 'Those pages do not match this document');
    if (!status.available[body.mode]) throw new HttpError(409, `The ${body.mode === 'color' ? 'colour' : 'black & white'} printer is offline right now. Please ask at the counter.`);
    if (body.sides === 'double' && !status.duplex[body.mode]) throw new HttpError(409, 'Printing on both sides is not available right now. Please choose single side.');
    let q;
    try {
      q = quote(shop.rates, body.mode, body.pages.length, base.copies);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    total = q.total;
    description = `${q.sheets} page${q.sheets > 1 ? 's' : ''} · ${body.mode === 'color' ? 'Colour' : 'B/W'}${body.sides === 'double' ? ' · Both sides' : ''}`;
    options = { mode: body.mode, sides: body.sides, copies: base.copies, pageList: body.pages, printPages: body.pages.length, rate: q.rate, total };
  }

  if (base.method === 'cash') {
    if (!shop.cash.enabled) throw new HttpError(409, 'This shop is not taking cash through the app. Please pay online.');
    const auto = shop.cash.autoPrint;
    const placed = await transition(job._id, auto ? 'queued' : 'awaiting_cash', {
      only: ['draft'],
      note: auto ? 'Cash order, printing straight away' : 'Cash order, waiting for the shop',
      set: { ...options, payment: { method: 'cash', ...(auto ? { paidAt: new Date() } : {}) } },
    });
    if (!placed) throw new HttpError(409, 'This job is already placed');
    if (auto) await dispatchShop(shop._id).catch((e) => console.error('[dispatch]', e));
    return res.json({ cash: true, status: placed.status, total });
  }

  const keys = await shopKeys(shop._id);
  if (!keys && !config.allowTestCheckout) throw new HttpError(409, 'This shop has not set up online payments yet. Please ask at the counter.');
  let order;
  try {
    order = await createOrder(keys, { receipt: job.ref, amount: total, notes: { jobRef: job.ref, shop: shop.code } });
  } catch (e) {
    if (e instanceof RazorpayError) throw new HttpError(502, 'Payment could not be started. Please ask the shop for help.');
    throw e;
  }
  job.set({ ...options, payment: { method: 'online', orderId: order.id, mock: order.mock } });
  await job.save();
  res.json({ orderId: order.id, amount: total, currency: 'INR', mock: order.mock, keyId: keys?.keyId, shopName: shop.name, description });
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
