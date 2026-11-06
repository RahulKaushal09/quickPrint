// What each audience gets to see. Customers never see storage keys, device
// ids or payment ids; shop owners never see other shops.

import { platformCut, type PlatformFee } from '@seedhaprint/shared';
import { ONLINE_WINDOW_MS } from './hub';
import { Device, type JobDoc, type ShopDoc } from './models';

export async function shopStatus(shopId: unknown) {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const devices = await Device.find({ shopId, revoked: false, online: true, lastSeenAt: { $gte: since } }).select('printers').lean();
  const printers = devices.flatMap((d) => d.printers ?? []);
  return { online: printers.some((p) => p.status !== 'offline'), printers };
}

export async function publicShop(shop: ShopDoc) {
  const { online } = await shopStatus(shop._id);
  return {
    code: shop.code,
    name: shop.name,
    area: shop.area,
    city: shop.city,
    phone: shop.phone,
    rates: shop.rates,
    open: shop.active && shop.accepting,
    online,
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
    rate: job.rate,
    total: job.total,
    platformFee: job.platformFee,
    printer: job.printer,
    error: job.error,
    paidAt: job.payment?.paidAt,
    printedAt: job.printedAt,
    mockPayment: Boolean(job.payment?.mock),
    createdAt: (job as any).createdAt,
    events: job.events,
  };
}

export const feeFor = (total: number, fee: { type?: string | null; value?: number | null }) =>
  platformCut(total, { type: (fee.type as PlatformFee['type']) || 'percent', value: fee.value || 0 });
