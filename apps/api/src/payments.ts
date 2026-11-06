// Razorpay over its REST API (no SDK needed). Without keys everything runs
// in mock mode: orders get a mock_ id and the web app shows a test checkout.
//
// With Route: when a shop has a linked account (acc_...), the order carries a
// transfer so Razorpay settles the shop's share straight to the shop and the
// platform keeps `platformFee`.

import crypto from 'node:crypto';
import { config, paymentsLive } from './config';

const API = 'https://api.razorpay.com/v1';

async function rzp<T>(method: string, url: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay ${res.status}`);
  return data as T;
}

export interface OrderInput {
  receipt: string;
  amount: number;
  shopAccountId?: string;
  platformFee: number;
  notes: Record<string, string>;
}

export async function createOrder(o: OrderInput): Promise<{ id: string; mock: boolean }> {
  if (!paymentsLive) return { id: `mock_${crypto.randomBytes(8).toString('hex')}`, mock: true };
  const body: any = { amount: o.amount, currency: 'INR', receipt: o.receipt, notes: o.notes };
  if (o.shopAccountId) {
    body.transfers = [
      { account: o.shopAccountId, amount: o.amount - o.platformFee, currency: 'INR', notes: o.notes, on_hold: false },
    ];
  }
  const order = await rzp<{ id: string }>('POST', '/orders', body);
  return { id: order.id, mock: false };
}

/** Checkout's handler signature: HMAC(order_id|payment_id). */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

export function webhookSignatureValid(raw: Buffer, signature: string): boolean {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(raw).digest('hex');
  return safeEqual(expected, signature);
}

/** Payment must belong to the order and be captured (or authorized, which we then capture). */
export async function confirmPayment(orderId: string, paymentId: string, amount: number): Promise<boolean> {
  const p = await rzp<{ order_id: string; status: string; amount: number }>('GET', `/payments/${paymentId}`);
  if (p.order_id !== orderId || p.amount !== amount) return false;
  if (p.status === 'authorized') {
    await rzp('POST', `/payments/${paymentId}/capture`, { amount, currency: 'INR' });
    return true;
  }
  return p.status === 'captured';
}

export async function refund(paymentId: string, amount: number, routed: boolean): Promise<string> {
  if (!paymentsLive) return `mock_rfnd_${crypto.randomBytes(6).toString('hex')}`;
  // reverse_all pulls the shop's share back from its linked account first.
  const r = await rzp<{ id: string }>('POST', `/payments/${paymentId}/refund`, { amount, speed: 'normal', ...(routed ? { reverse_all: 1 } : {}) });
  return r.id;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
