// Razorpay over its REST API, using each shop's own account: customers pay the
// shop directly and the money settles to the shop's bank.
//
// A shop with no keys gets mock orders only where ALLOW_TEST_CHECKOUT permits;
// production refuses to print for free.

import crypto from 'node:crypto';
import { config } from './config';
import { Shop } from './models';
import { decrypt } from './secrets';

export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
}

export class RazorpayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function rzp<T>(keys: RazorpayKeys, method: string, url: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64');
  const res = await fetch(config.razorpayApiUrl + url, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new RazorpayError(res.status, data?.error?.description || `Razorpay ${res.status}`);
  return data as T;
}

/** The shop's decrypted keys, or null if it has not connected Razorpay. */
export async function shopKeys(shopId: unknown): Promise<RazorpayKeys | null> {
  const shop = await Shop.findById(shopId).select('+razorpay.keySecret').lean();
  const r = shop?.razorpay;
  return r?.keyId && r.keySecret ? { keyId: r.keyId, keySecret: decrypt(r.keySecret) } : null;
}

/** Throws RazorpayError(401) for wrong keys. */
export async function verifyKeys(keys: RazorpayKeys): Promise<void> {
  await rzp(keys, 'GET', '/orders?count=1');
}

export async function createOrder(
  keys: RazorpayKeys | null,
  o: { receipt: string; amount: number; notes: Record<string, string> },
): Promise<{ id: string; mock: boolean }> {
  if (!keys) return { id: `mock_${crypto.randomBytes(8).toString('hex')}`, mock: true };
  const order = await rzp<{ id: string }>(keys, 'POST', '/orders', { amount: o.amount, currency: 'INR', receipt: o.receipt, notes: o.notes });
  return { id: order.id, mock: false };
}

/** Checkout's handler signature: HMAC(order_id|payment_id). */
export function checkoutSignatureValid(keySecret: string, orderId: string, paymentId: string, signature: string): boolean {
  return safeEqual(crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex'), signature);
}

export function webhookSignatureValid(secret: string, raw: Buffer, signature: string): boolean {
  return safeEqual(crypto.createHmac('sha256', secret).update(raw).digest('hex'), signature);
}

/** Payment must belong to the order and be captured (or authorized, which we then capture). */
export async function confirmPayment(keys: RazorpayKeys, orderId: string, paymentId: string, amount: number): Promise<boolean> {
  const p = await rzp<{ order_id: string; status: string; amount: number }>(keys, 'GET', `/payments/${paymentId}`);
  if (p.order_id !== orderId || p.amount !== amount) return false;
  if (p.status === 'authorized') {
    await rzp(keys, 'POST', `/payments/${paymentId}/capture`, { amount, currency: 'INR' });
    return true;
  }
  return p.status === 'captured';
}

export async function refund(keys: RazorpayKeys, paymentId: string, amount: number): Promise<string> {
  const r = await rzp<{ id: string }>(keys, 'POST', `/payments/${paymentId}/refund`, { amount, speed: 'normal' });
  return r.id;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
