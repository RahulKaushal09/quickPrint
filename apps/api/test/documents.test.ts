import assert from 'node:assert/strict';
import { test } from 'node:test';
import { degrees, PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { DocumentError, makePrintReady, rotatePdf } from '../src/documents';

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

test('rotation turns every page and adds to any rotation already there', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.addPage().setRotation(degrees(90));
  const out = await PDFDocument.load(await rotatePdf(Buffer.from(await doc.save()), 270));
  assert.deepEqual(out.getPages().map((p) => p.getRotation().angle), [270, 0]);
});
