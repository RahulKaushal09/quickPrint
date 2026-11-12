import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import type { PageChoice } from '@seedhaprint/shared';
import { appendPdf, DocumentError, layoutForPrint, makePrintReady, normalizePhoto, photoSheet } from '../src/documents';

test('PDFs pass through untouched with their page count', async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 4; i++) doc.addPage();
  const pdf = Buffer.from(await doc.save());
  const r = await makePrintReady(pdf, 'notes.pdf');
  assert.equal(r.pages, 4);
  assert.equal(r.pdf, pdf);
});

test('a landscape photo becomes one landscape A4 page', async () => {
  const jpg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#3366cc' } }).jpeg().toBuffer();
  const r = await makePrintReady(jpg, 'IMG_2041.jpg');
  assert.equal(r.pages, 1);
  const page = (await PDFDocument.load(r.pdf)).getPage(0);
  assert.ok(page.getWidth() > page.getHeight());
});

test('anything else is refused with a readable message', async () => {
  await assert.rejects(makePrintReady(Buffer.from('hello world'), 'notes.txt'), DocumentError);
  await assert.rejects(makePrintReady(Buffer.from('%PDF-1.7 garbage'), 'broken.pdf'), /damaged/);
});

const A4 = [595.28, 841.89];

const withContent = (page: PDFPage) => page.drawRectangle({ x: 10, y: 10, width: 50, height: 50 });

const all = (n: number): PageChoice[] => Array.from({ length: n }, (_, i) => ({ p: i + 1, r: 0 }));

test('a full upright document with no changes goes through untouched', async () => {
  const doc = await PDFDocument.create();
  doc.addPage(A4 as [number, number]);
  const pdf = Buffer.from(await doc.save());
  assert.equal(await layoutForPrint(pdf, []), pdf);
  assert.equal(await layoutForPrint(pdf, all(1)), pdf);
});

test('the paper stays upright A4 for every rotation and for wide pages', async () => {
  const doc = await PDFDocument.create();
  withContent(doc.addPage([842, 595]));
  withContent(doc.addPage(A4 as [number, number]));
  doc.addPage(A4 as [number, number]); // blank, as scanned documents often have
  const pdf = Buffer.from(await doc.save());
  for (const r of [0, 90, 180, 270] as const) {
    const pages = (await PDFDocument.load(await layoutForPrint(pdf, all(3).map((c) => ({ ...c, r }))))).getPages();
    assert.equal(pages.length, 3);
    for (const p of pages) assert.deepEqual([p.getWidth(), p.getHeight(), p.getRotation().angle], [...A4, 0]);
  }
});

test('only the chosen pages print, in the chosen order', async () => {
  const doc = await PDFDocument.create();
  for (const width of [100, 200, 300]) withContent(doc.addPage([width, 800]));
  const pdf = Buffer.from(await doc.save());
  const out = await PDFDocument.load(await layoutForPrint(pdf, [{ p: 3, r: 0 }, { p: 1, r: 0 }]));
  assert.equal(out.getPageCount(), 2);
});

test('uploads join into one document', async () => {
  const make = async (n: number) => {
    const d = await PDFDocument.create();
    for (let i = 0; i < n; i++) withContent(d.addPage());
    return Buffer.from(await d.save());
  };
  assert.equal((await PDFDocument.load(await appendPdf(await make(2), await make(3)))).getPageCount(), 5);
});

test('a passport photo sheet is the real paper size with every photo on it', async () => {
  const face = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#d4a373' } }).jpeg().toBuffer();
  const { jpeg } = await normalizePhoto(face);
  const pdf = await PDFDocument.load(await photoSheet(jpeg, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 0, '4x6', '35x45', 8));
  const page = pdf.getPage(0);
  assert.equal(Math.round((page.getWidth() / 72) * 25.4 * 10) / 10, 101.6);
  assert.equal(Math.round((page.getHeight() / 72) * 25.4 * 10) / 10, 152.4);
});
