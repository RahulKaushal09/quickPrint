import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extendPaidUntil, subscriptionState } from '../src/subscription';

const day = 86400_000;
const now = new Date('2026-11-12T06:30:00Z'); // 12 Nov, noon in India

test('free shops never switch off', () => {
  assert.equal(subscriptionState({ fee: 0 }, 3, now).state, 'free');
  assert.equal(subscriptionState(undefined, 3, now).state, 'free');
});

test('state follows the paid-until date and the grace days', () => {
  const at = (days: number) => subscriptionState({ fee: 49900, paidUntil: new Date(now.getTime() + days * day) }, 3, now).state;
  assert.equal(at(20), 'active');
  assert.equal(at(4), 'due_soon');
  assert.equal(at(-1), 'grace');
  assert.equal(at(-3.5), 'off');
  assert.equal(subscriptionState({ fee: 49900, paidUntil: null }, 3, now).state, 'off');
});

test('paying early adds to the end date; paying late counts from today', () => {
  const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  assert.equal(ist(extendPaidUntil(new Date('2026-11-30T18:29:59Z'), 1, now)), '2026-12-30');
  assert.equal(ist(extendPaidUntil(new Date('2026-10-01T00:00:00Z'), 1, now)), '2026-12-12');
  assert.equal(ist(extendPaidUntil(null, 12, now)), '2027-11-12');
  assert.equal(ist(extendPaidUntil(new Date('2027-01-31T10:00:00Z'), 1, now)), '2027-02-28');
});
