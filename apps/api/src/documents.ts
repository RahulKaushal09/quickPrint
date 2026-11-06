// Turns whatever the customer uploaded into one print-ready PDF and counts its
// pages. PDFs pass through untouched; photos become one A4 page each; office
// files go through LibreOffice when SOFFICE_PATH is set.

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { degrees, PDFDocument, type PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import { LIMITS } from '@seedhaprint/shared';
import { config } from './config';

const run = promisify(execFile);

export class DocumentError extends Error {}

export interface PrintReady {
  pdf: Buffer;
  pages: number;
}

const A4 = { w: 595.28, h: 841.89 };
const OFFICE_EXT = new Set(['.doc', '.docx', '.odt', '.rtf', '.ppt', '.pptx', '.xls', '.xlsx']);

export const officeSupported = () => Boolean(config.sofficePath);

export function acceptedTypes(): string[] {
  const base = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic'];
  return officeSupported() ? [...base, ...OFFICE_EXT] : base;
}

function kind(buf: Buffer, name: string): 'pdf' | 'image' | 'office' | 'unknown' {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const head = buf.subarray(0, 12);
  if (head[0] === 0xff && head[1] === 0xd8) return 'image'; // jpeg
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image';
  if (head.subarray(4, 8).toString('latin1') === 'ftyp') return 'image'; // heic/avif
  if (OFFICE_EXT.has(path.extname(name).toLowerCase())) return 'office';
  return 'unknown';
}

async function countPdf(buf: Buffer): Promise<number> {
  try {
    const doc = await PDFDocument.load(buf, { updateMetadata: false });
    return doc.getPageCount();
  } catch (e) {
    if (/encrypt/i.test(String(e))) throw new DocumentError('This PDF is password protected. Remove the password and upload again.');
    throw new DocumentError('This PDF looks damaged and cannot be printed.');
  }
}

async function imageToPdf(buf: Buffer): Promise<Buffer> {
  let jpeg: Buffer;
  let meta: sharp.OutputInfo;
  try {
    // Respect phone rotation, drop transparency onto white, cap the size so huge photos stay quick.
    ({ data: jpeg, info: meta } = await sharp(buf)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: 3508, height: 3508, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new DocumentError('This image format is not supported. Please upload a JPG, PNG or PDF.');
  }
  const doc = await PDFDocument.create();
  const landscape = meta.width > meta.height;
  const pw = landscape ? A4.h : A4.w;
  const ph = landscape ? A4.w : A4.h;
  const margin = 18;
  const scale = Math.min((pw - margin * 2) / meta.width, (ph - margin * 2) / meta.height);
  const w = meta.width * scale;
  const h = meta.height * scale;
  const page = doc.addPage([pw, ph]);
  page.drawImage(await doc.embedJpg(jpeg), { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  return Buffer.from(await doc.save());
}

async function officeToPdf(buf: Buffer, name: string): Promise<Buffer> {
  if (!officeSupported()) throw new DocumentError('Word and Office files are not accepted here yet. Please save it as PDF and upload again.');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sp-office-'));
  try {
    const input = path.join(dir, 'input' + path.extname(name).toLowerCase());
    await fs.writeFile(input, buf);
    await run(config.sofficePath, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, input], { timeout: 90_000 });
    return await fs.readFile(path.join(dir, 'input.pdf'));
  } catch (e) {
    if (e instanceof DocumentError) throw e;
    throw new DocumentError('This file could not be converted. Please save it as PDF and upload again.');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * The file the printer gets. The sheet is always upright A4 and the customer's
 * document turns on it, scaled to fit, exactly as the preview shows. Building
 * upright pages also stops printer drivers turning wide pages by themselves.
 * Upright documents with no rotation go through untouched.
 */
export async function layoutForPrint(pdf: Buffer, rotation: number): Promise<Buffer> {
  const src = await PDFDocument.load(pdf, { updateMetadata: false });
  const pages = src.getPages();
  const angleOf = (p: PDFPage) => (((p.getRotation().angle + rotation) % 360) + 360) % 360;
  const sideways = (p: PDFPage) => {
    const { width, height } = p.getCropBox();
    return angleOf(p) % 180 === 0 ? width > height : height > width;
  };
  if (!rotation && !pages.some(sideways)) return pdf;

  // Embedding copies only page content, so filled-in form fields must become content first.
  try {
    src.getForm().flatten();
  } catch {
    // Some forms can't be flattened. The page itself still prints.
  }
  const out = await PDFDocument.create();
  for (const page of pages) {
    // Blank pages have no content to embed, but still count as a printed sheet.
    if (!page.node.Contents()) {
      out.addPage([A4.w, A4.h]);
      continue;
    }
    const box = page.getCropBox();
    const embedded = await out.embedPage(page, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height });
    const angle = angleOf(page);
    const turned = angle % 180 !== 0;
    const scale = Math.min(A4.w / (turned ? box.height : box.width), A4.h / (turned ? box.width : box.height));
    const w = box.width * scale;
    const h = box.height * scale;
    const x = (A4.w - (turned ? h : w)) / 2;
    const y = (A4.h - (turned ? w : h)) / 2;
    // drawPage turns around its lower-left corner, so that corner moves to keep the page inside its box.
    const anchor = { 0: { x, y }, 90: { x, y: y + w }, 180: { x: x + w, y: y + h }, 270: { x: x + h, y } }[angle as 0 | 90 | 180 | 270];
    out.addPage([A4.w, A4.h]).drawPage(embedded, { ...anchor, xScale: scale, yScale: scale, rotate: degrees(-angle) });
  }
  return Buffer.from(await out.save());
}

export async function makePrintReady(buf: Buffer, name: string): Promise<PrintReady> {
  if (buf.length > LIMITS.maxFileBytes) throw new DocumentError('File is larger than 25 MB.');
  let pdf: Buffer;
  switch (kind(buf, name)) {
    case 'pdf':
      pdf = buf;
      break;
    case 'image':
      pdf = await imageToPdf(buf);
      break;
    case 'office':
      pdf = await officeToPdf(buf, name);
      break;
    default:
      throw new DocumentError('Please upload a PDF or a photo (JPG, PNG).');
  }
  const pages = await countPdf(pdf);
  if (pages < 1) throw new DocumentError('This document has no pages.');
  if (pages > LIMITS.maxPages) throw new DocumentError(`Documents are limited to ${LIMITS.maxPages} pages.`);
  return { pdf, pages };
}
