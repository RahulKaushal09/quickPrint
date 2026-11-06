// What each audience gets to see. Customers never see storage keys, device
// ids or payment ids; shop owners never see other shops.

import type { AgentPrinter } from '@seedhaprint/shared';
import { config } from './config';
import { ONLINE_WINDOW_MS, printerFits } from './hub';
import { Device, type JobDoc, type ShopDoc } from './models';

export async function shopStatus(shopId: unknown) {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const devices = await Device.find({ shopId, revoked: false, online: true, lastSeenAt: { $gte: since } }).select('printers').lean();
  const printers = devices.flatMap((d) => d.printers ?? []).filter((p) => p.status !== 'offline') as AgentPrinter[];
  return { online: printers.length > 0, printers };
}

export async function publicShop(shop: ShopDoc) {
  const { online, printers } = await shopStatus(shop._id);
  const can = (mode: string, sides: string) => printers.some((p) => printerFits(p, mode, sides, shop.printers));
  return {
    code: shop.code,
    name: shop.name,
    area: shop.area,
    city: shop.city,
    phone: shop.phone,
    rates: shop.rates,
    open: shop.active && shop.accepting,
    online,
    /** Whether each kind of print has a working printer right now. */
    available: { bw: can('bw', 'single'), color: can('color', 'single') },
    duplex: { bw: shop.rates.duplexEnabled && can('bw', 'double'), color: shop.rates.duplexEnabled && can('color', 'double') },
    payments: shop.razorpay.keyId ? 'razorpay' : config.allowTestCheckout ? 'test' : 'none',
    cash: shop.cash.enabled,
  };
}

export function publicJob(job: JobDoc, shop?: { name: string; area?: string | null; code: string }) {
  return {
    ref: job.ref,
    status: job.status,
    pickupCode: job.pickupCode,
    file: { name: job.file.name, pages: job.printPages ?? job.file.pages, totalPages: job.file.pages },
    mode: job.mode,
    sides: job.sides,
    copies: job.copies,
    rate: job.rate,
    total: job.total,
    paid: Boolean(job.payment?.paidAt),
    cash: job.payment?.method === 'cash',
    paidAt: job.payment?.paidAt,
    printedAt: job.printedAt,
    createdAt: (job as any).createdAt,
    events: job.events.filter((e) => e.status !== 'draft').map((e) => ({ at: e.at, status: e.status })),
    shop: shop ? { name: shop.name, area: shop.area, code: shop.code } : undefined,
  };
}

export function shopJob(job: JobDoc) {
  return {
    id: String(job._id),
    ref: job.ref,
    status: job.status,
    pickupCode: job.pickupCode,
    file: { name: job.file.name, pages: job.printPages ?? job.file.pages, bytes: job.file.bytes, available: Boolean(job.file.key) },
    mode: job.mode,
    sides: job.sides,
    copies: job.copies,
    cash: job.payment?.method === 'cash',
    rate: job.rate,
    total: job.total,
    printer: job.printer,
    error: job.error,
    paidAt: job.payment?.paidAt,
    printedAt: job.printedAt,
    mockPayment: Boolean(job.payment?.mock),
    createdAt: (job as any).createdAt,
    events: job.events,
  };
}
