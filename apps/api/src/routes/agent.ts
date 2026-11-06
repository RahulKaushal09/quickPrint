// HTTP side of the shop-PC agent: pairing and file download. The live
// connection itself is the WebSocket in hub.ts.

import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { z } from 'zod';
import { BRAND } from '@seedhaprint/shared';
import { HttpError } from '../auth';
import { authenticate, hashToken } from '../hub';
import { Device, Job, PairCode, Shop } from '../models';
import { storage } from '../storage';

export const agentRoutes = Router();

async function device(req: Request) {
  const d = await authenticate(req);
  if (!d) throw new HttpError(401, 'This PC is not paired');
  return d;
}

agentRoutes.post('/pair', rateLimit({ windowMs: 15 * 60_000, limit: 20 }), async (req, res) => {
  const body = z
    .object({ code: z.string().trim().toUpperCase(), hostname: z.string().max(80).default('Shop PC'), os: z.string().max(80).default(''), version: z.string().max(20).default('') })
    .parse(req.body);
  const pair = await PairCode.findOneAndDelete({ code: body.code.replace(/[\s-]/g, ''), expiresAt: { $gt: new Date() } });
  if (!pair) throw new HttpError(400, 'That pairing code is wrong or has expired. Create a new one in the dashboard.');
  const shop = await Shop.findById(pair.shopId);
  if (!shop) throw new HttpError(400, 'Shop not found');

  const token = crypto.randomBytes(32).toString('base64url');
  const d = await Device.create({ shopId: shop._id, name: body.hostname, os: body.os, version: body.version, tokenHash: hashToken(token) });
  res.json({ deviceId: String(d._id), token, shopName: shop.name, shopCode: shop.code });
});

agentRoutes.get('/jobs/:id/file', async (req, res) => {
  const d = await device(req);
  const job = await Job.findOne({ _id: req.params.id, deviceId: d._id, status: { $in: ['sent', 'printing'] } });
  if (!job || !job.file.key) throw new HttpError(404, 'Job not available for this PC');
  res.setHeader('Content-Type', 'application/pdf');
  (await storage.stream(job.file.key)).pipe(res);
});

agentRoutes.get('/test-page', async (req, res) => {
  const d = await device(req);
  const shop = await Shop.findById(d.shopId).lean();
  const printer = String(req.query.printer || '');

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.06, 0.09, 0.16);
  // CMYK swatches so the shop can see colour output at a glance.
  const swatches = [rgb(0, 0.68, 0.94), rgb(0.93, 0, 0.55), rgb(1, 0.9, 0), rgb(0.1, 0.1, 0.1)];
  swatches.forEach((c, i) => page.drawRectangle({ x: 60 + i * 60, y: 700, width: 48, height: 48, color: c }));
  page.drawText(BRAND.name, { x: 60, y: 640, size: 30, font: bold, color: ink });
  page.drawText('Printer test page', { x: 60, y: 610, size: 16, font, color: ink });
  const lines = [
    `Shop: ${shop?.name ?? ''} (${shop?.code ?? ''})`,
    `PC: ${d.name}`,
    `Printer: ${printer}`,
    `Printed: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    '',
    'If you can read this, the printer is connected and customers',
    'can now print from your QR code.',
  ];
  lines.forEach((l, i) => page.drawText(l, { x: 60, y: 560 - i * 22, size: 12, font, color: ink }));
  // Edge marks: all four should be visible if scaling is right.
  for (const [x, y] of [[20, 20], [565, 20], [20, 812], [565, 812]] as const) page.drawRectangle({ x, y, width: 10, height: 10, color: ink });

  res.setHeader('Content-Type', 'application/pdf');
  res.end(Buffer.from(await doc.save()));
});
