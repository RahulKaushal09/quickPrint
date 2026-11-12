import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canMove, photoLayout, photosPerSheet, quote, rupees, sheetsFor } from '../src/index';

const card = { bwPerPage: 200, colorPerPage: 1000, colorEnabled: true };

test('quote multiplies pages by copies at the chosen rate', () => {
  assert.deepEqual(quote(card, 'bw', 12, 2), { pages: 12, copies: 2, sheets: 24, rate: 200, total: 4800 });
  assert.equal(quote(card, 'color', 3, 1).total, 3000);
});

test('quote enforces the ₹1 minimum and the limits', () => {
  assert.equal(quote({ ...card, bwPerPage: 50 }, 'bw', 1, 1).total, 100);
  assert.throws(() => quote(card, 'bw', 0, 1));
  assert.throws(() => quote(card, 'bw', 1, 51));
  assert.throws(() => quote({ ...card, colorEnabled: false }, 'color', 1, 1), /colour/);
});

test('job transitions only move forward', () => {
  assert.ok(canMove('draft', 'queued'));
  assert.ok(canMove('sent', 'queued'));
  assert.ok(!canMove('printed', 'queued'));
  assert.ok(!canMove('refunded', 'queued'));
});

test('rupees formats Indian style', () => {
  assert.equal(rupees(150000), '₹1,500');
  assert.equal(rupees(150), '₹1.50');
});

test('cash jobs wait for the shop, then join the queue', () => {
  assert.ok(canMove('draft', 'awaiting_cash'));
  assert.ok(canMove('awaiting_cash', 'queued'));
  assert.ok(!canMove('awaiting_cash', 'printing'));
});

test('double-sided printing uses half the paper, rounding up', () => {
  assert.equal(sheetsFor(5, 'single'), 5);
  assert.equal(sheetsFor(5, 'double'), 3);
  assert.equal(sheetsFor(4, 'double'), 2);
});

test('passport photos: 8 fit on 4x6 paper by turning them sideways, 6 upright', () => {
  assert.equal(photosPerSheet('4x6', '35x45'), 8);
  const six = photoLayout('4x6', '35x45', 6);
  assert.equal(six.slots.length, 6);
  assert.ok(six.slots.every((s) => !s.turned));
  const eight = photoLayout('4x6', '35x45', 8);
  assert.equal(eight.slots.length, 8);
  assert.ok(eight.slots.every((s) => s.turned && s.w === 45 && s.h === 35));
  for (const s of eight.slots) assert.ok(s.x >= 3 && s.y >= 3 && s.x + s.w <= 101.6 - 3 && s.y + s.h <= 152.4 - 3);
  assert.ok(photosPerSheet('A4', '35x45') >= 30);
});
