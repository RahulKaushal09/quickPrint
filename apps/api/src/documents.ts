// Turns whatever the customer uploaded into one print-ready PDF and counts its
// pages. PDFs pass through untouched; photos become one A4 page each; office
// files go through LibreOffice when SOFFICE_PATH is set.

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { degrees, PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import { LIMITS, photoLayout, type PageChoice, type PhotoPaper, type PhotoSize } from '@seedhaprint/shared';
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

/** Adds another upload after the pages already there. */
export async function appendPdf(existing: Buffer, addition: Buffer): Promise<Buffer> {
  const [doc, extra] = await Promise.all([PDFDocument.load(existing, { updateMetadata: false }), PDFDocument.load(addition, { updateMetadata: false })]);
  for (const page of await doc.copyPages(extra, extra.getPageIndices())) doc.addPage(page);
  return Buffer.from(await doc.save());
}

/**
 * The file the printer gets: the chosen pages in the chosen order. The sheet is
 * always upright A4 and each page turns on it, scaled to fit, exactly as the
 * preview shows. Building upright pages also stops printer drivers turning wide
 * pages by themselves. A full upright document with no changes goes through untouched.
 */
export async function layoutForPrint(pdf: Buffer, choices: PageChoice[]): Promise<Buffer> {
  const src = await PDFDocument.load(pdf, { updateMetadata: false });
  const pages = src.getPages();
  const list = choices.length ? choices : pages.map((_, i) => ({ p: i + 1, r: 0 as const }));
  const angleOf = (page: PDFPage, r: number) => (((page.getRotation().angle + r) % 360) + 360) % 360;
  const sideways = (page: PDFPage, r: number) => {
    const { width, height } = page.getCropBox();
    return angleOf(page, r) % 180 === 0 ? width > height : height > width;
  };
  const unchanged = list.length === pages.length && list.every((c, i) => c.p === i + 1 && !c.r && !sideways(pages[i]!, 0));
  if (unchanged) return pdf;

  // Embedding copies only page content, so filled-in form fields must become content first.
  try {
    src.getForm().flatten();
  } catch {
    // Some forms can't be flattened. The page itself still prints.
  }
  const out = await PDFDocument.create();
  for (const { p, r } of list) {
    const page = pages[p - 1];
    if (!page) continue;
    // Blank pages have no content to embed, but still count as a printed side.
    if (!page.node.Contents()) {
      out.addPage([A4.w, A4.h]);
      continue;
    }
    const box = page.getCropBox();
    const embedded = await out.embedPage(page, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height });
    const angle = angleOf(page, r);
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

/**
 * One half of a both-sides job printed by hand: every front, or every back,
 * for all copies in one file. An odd page count gets a blank last back so
 * fronts and backs pair up. reverse prints the backs last-to-first, for
 * printers whose output stack comes back the other way round.
 */
export async function sideOfJob(pdf: Buffer, copies: number, side: 'front' | 'back', reverse = false): Promise<Buffer> {
  const src = await PDFDocument.load(pdf, { updateMetadata: false });
  const count = src.getPageCount();
  const one: (number | null)[] = [];
  for (let i = side === 'front' ? 0 : 1; i < count + (count % 2); i += 2) one.push(i < count ? i : null);
  const all = Array.from({ length: Math.max(1, copies) }, () => one).flat();
  if (side === 'back' && reverse) all.reverse();
  const out = await PDFDocument.create();
  // Each page is embedded once and drawn as often as needed, so 20 copies don't make a file 20 times the size.
  const embedded = new Map<number, Awaited<ReturnType<typeof out.embedPage>>>();
  const pages = src.getPages();
  for (const i of all) {
    if (i === null) {
      out.addPage([A4.w, A4.h]);
      continue;
    }
    const page = pages[i]!;
    const box = page.getCropBox();
    if (!page.node.Contents()) {
      out.addPage([box.width, box.height]); // a blank page has nothing to embed
      continue;
    }
    if (!embedded.has(i)) embedded.set(i, await out.embedPage(page, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height }));
    const angle = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    const turned = angle % 180 !== 0;
    const { width: w, height: h } = box;
    const anchor = { 0: { x: 0, y: 0 }, 90: { x: 0, y: w }, 180: { x: w, y: h }, 270: { x: h, y: 0 } }[angle];
    out.addPage(turned ? [h, w] : [w, h]).drawPage(embedded.get(i)!, { ...anchor, rotate: degrees(-angle) });
  }
  return Buffer.from(await out.save());
}

/** A customer photo, upright and a sensible size, ready to crop. */
export async function normalizePhoto(buf: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(buf)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  } catch {
    throw new DocumentError('Please upload a photo (JPG or PNG).');
  }
}

export interface Crop {
  /** Fractions of the turned picture, 0 to 1. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const MM = 72 / 25.4;

/** A sheet of passport photos at their exact size, with light marks to cut along. */
export async function photoSheet(source: Buffer, crop: Crop, turn: number, paper: PhotoPaper, size: PhotoSize, count: number): Promise<Buffer> {
  const turned = sharp(source).rotate(turn);
  const meta = await sharp(await turned.clone().toBuffer()).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const clamp = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), max);
  const left = clamp(crop.x * W, W - 1);
  const top = clamp(crop.y * H, H - 1);
  const layout = photoLayout(paper, size, count);
  const slot = layout.slots[0]!;
  const [pw, ph] = slot.turned ? [slot.h, slot.w] : [slot.w, slot.h];
  // 600 dpi is sharp for photo paper and keeps the file small.
  const photo = await turned
    .extract({ left, top, width: clamp(crop.w * W, W - left) || 1, height: clamp(crop.h * H, H - top) || 1 })
    .resize(Math.round((pw / 25.4) * 600), Math.round((ph / 25.4) * 600), { fit: 'fill' })
    .jpeg({ quality: 93 })
    .toBuffer();

  const doc = await PDFDocument.create();
  const page = doc.addPage([layout.page.w * MM, layout.page.h * MM]);
  const image = await doc.embedJpg(photo);
  const guide = rgb(0.82, 0.82, 0.82);
  for (const s of layout.slots) {
    const x = s.x * MM;
    const y = (layout.page.h - s.y - s.h) * MM; // PDF measures from the bottom
    page.drawRectangle({ x: x - 0.4, y: y - 0.4, width: s.w * MM + 0.8, height: s.h * MM + 0.8, borderColor: guide, borderWidth: 0.4 });
    if (s.turned) {
      // Upright photo turned a quarter clockwise, so it fills the sideways slot.
      page.drawImage(image, { x, y: y + s.h * MM, width: s.h * MM, height: s.w * MM, rotate: degrees(-90) });
    } else {
      page.drawImage(image, { x, y, width: s.w * MM, height: s.h * MM });
    }
  }
  return Buffer.from(await doc.save());
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
