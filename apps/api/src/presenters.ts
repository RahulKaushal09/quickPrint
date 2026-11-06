// What each audience gets to see. Customers never see storage keys, device
// ids or payment ids; shop owners never see other shops.

import { config } from './config';
import { ONLINE_WINDOW_MS, printerList } from './hub';
import { Device, type JobDoc, type ShopDoc } from './models';

export async function shopStatus(shopId: unknown) {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const devices = await Device.find({ shopId, revoked: false, online: true, lastSeenAt: { $gte: since } }).select('printers').lean();
  const printers = devices.flatMap((d) => d.printers ?? []).filter((p) => p.status !== 'offline');
  return { online: printers.length > 0, names: printers.map((p) => p.name) };
}

export async function publicShop(shop: ShopDoc) {
  const { online, names } = await shopStatus(shop._id);
  const can = (assigned: unknown) => {
    const list = printerList(assigned);
    return list.length ? list.some((p) => names.includes(p)) : online;
  };
  return {
    code: shop.code,
    name: shop.name,
    area: shop.area,
    city: shop.city,
    phone: shop.phone,
    rates: shop.rates,
    open: shop.active && shop.accepting,
    online,
    /** Whether each print type has a working printer right now. */
    available: { bw: can(shop.printers.bw), color: can(shop.printers.color) },
    payments: shop.razorpay.keyId ? 'razorpay' : config.allowTestCheckout ? 'test' : 'none',
  };
}

export function publicJob(job: JobDoc, shop?: { name: string; area?: string | null; code: string }) {
  return {
    ref: job.ref,
    status: job.status,
    pickupCode: job.pickupCode,
    file: { name: job.file.name, pages: job.file.pages },
    mode: job.mode,
    copies: job.copies,
    rate: job.rate,
    total: job.total,
    paid: Boolean(job.payment?.paidAt),
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
    file: { name: job.file.name, pages: job.file.pages, bytes: job.file.bytes, available: Boolean(job.file.key) },
    mode: job.mode,
    copies: job.copies,
    rotation: job.rotation,
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
