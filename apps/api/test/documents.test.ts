import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import { DocumentError, layoutForPrint, makePrintReady } from '../src/documents';

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

test('an upright document with no rotation goes through untouched', async () => {
  const doc = await PDFDocument.create();
  doc.addPage(A4 as [number, number]);
  const pdf = Buffer.from(await doc.save());
  assert.equal(await layoutForPrint(pdf, 0), pdf);
});

test('the paper stays upright A4 for every rotation and for wide pages', async () => {
  const doc = await PDFDocument.create();
  withContent(doc.addPage([842, 595]));
  withContent(doc.addPage(A4 as [number, number]));
  doc.addPage(A4 as [number, number]); // blank, as scanned documents often have
  const pdf = Buffer.from(await doc.save());
  for (const rotation of [0, 90, 180, 270]) {
    const pages = (await PDFDocument.load(await layoutForPrint(pdf, rotation))).getPages();
    assert.equal(pages.length, 3);
    for (const p of pages) {
      assert.deepEqual([p.getWidth(), p.getHeight(), p.getRotation().angle], [...A4, 0]);
    }
  }
});
