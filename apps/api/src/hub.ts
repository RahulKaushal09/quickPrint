// The agent hub: keeps a WebSocket per connected shop PC and hands it paid
// jobs.
//
// Scaling: each API server only talks to the PCs connected to it. A job is
// claimed with an atomic queued -> sent update, so any number of servers can
// run side by side against the same MongoDB with no Redis. The server that
// took the payment dispatches at once; every server also sweeps its own shops
// every few seconds, which covers payments taken on another server.

import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import mongoose, { type Types } from 'mongoose';
import { WebSocket, WebSocketServer } from 'ws';
import type { AgentMessage, AgentPrinter, JobOrder, ServerMessage } from '@seedhaprint/shared';
import { config } from './config';
import { transition } from './jobs';
import { Device, Job, Shop, type DeviceDoc, type JobDoc } from './models';

interface Conn {
  ws: WebSocket;
  deviceId: string;
  shopId: string;
  printers: AgentPrinter[];
  alive: boolean;
}

const conns = new Map<string, Conn>(); // deviceId -> connection
const byShop = new Map<string, Set<string>>(); // shopId -> deviceIds

/** A PC counts as online while connected and heard from within this window (the window covers a server that died without marking its PCs offline). */
export const ONLINE_WINDOW_MS = 75_000;

export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

function send(c: Conn, msg: ServerMessage) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

export async function authenticate(req: IncomingMessage): Promise<DeviceDoc | null> {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return Device.findOne({ tokenHash: hashToken(token), revoked: false });
}

export function attach(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, _req: IncomingMessage, device: DeviceDoc) => {
    const deviceId = String(device._id);
    const shopId = String(device.shopId);
    conns.get(deviceId)?.ws.close(4000, 'Replaced by a newer connection');

    const c: Conn = { ws, deviceId, shopId, printers: device.printers as AgentPrinter[], alive: true };
    conns.set(deviceId, c);
    if (!byShop.has(shopId)) byShop.set(shopId, new Set());
    byShop.get(shopId)!.add(deviceId);

    // Listeners go on before any await, or the agent's first 'hello' would be lost.
    ws.on('pong', () => (c.alive = true));
    ws.on('message', (raw) => {
      let msg: AgentMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      handle(c, msg).catch((e) => console.error('[hub]', deviceId, e));
    });
    ws.on('close', () => {
      if (conns.get(deviceId) !== c) return; // already replaced
      conns.delete(deviceId);
      byShop.get(shopId)?.delete(deviceId);
      void onDisconnect(deviceId, shopId);
    });

    const shop = await Shop.findById(shopId).lean();
    send(c, { type: 'welcome', deviceId, shopName: shop?.name ?? '', shopCode: shop?.code ?? '' });
  });

  // Drop sockets that stopped answering pings (pulled network cable, sleeping PC).
  setInterval(() => {
    for (const c of conns.values()) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 25_000).unref();

  setInterval(() => void sweep().catch((e) => console.error('[hub] sweep', e)), 3_000).unref();
}

async function handle(c: Conn, msg: AgentMessage) {
  const now = new Date();
  switch (msg.type) {
    case 'hello':
      c.printers = msg.printers ?? [];
      await Device.updateOne(
        { _id: c.deviceId },
        { printers: c.printers, version: msg.version, os: msg.os, name: msg.hostname || undefined, lastSeenAt: now, online: true },
      );
      await dispatchShop(c.shopId);
      return;
    case 'printers':
      c.printers = msg.printers ?? [];
      await Device.updateOne({ _id: c.deviceId }, { printers: c.printers, lastSeenAt: now, online: true });
      await dispatchShop(c.shopId);
      return;
    case 'ping':
      send(c, { type: 'pong' });
      await Device.updateOne({ _id: c.deviceId }, { lastSeenAt: now, online: true });
      return;
  }

  if (msg.jobId.startsWith('test-')) return;
  const mine = { deviceId: c.deviceId };
  switch (msg.type) {
    case 'job.accepted':
      await Job.updateOne({ _id: msg.jobId, ...mine, status: 'sent' }, { acceptedAt: now });
      return;
    case 'job.printing':
      await transition(msg.jobId, 'printing', { only: ['sent'], filter: mine, note: 'Printer started' });
      return;
    case 'job.waiting':
      await Job.updateOne(
        { _id: msg.jobId, ...mine, status: { $in: ['sent', 'printing'] } },
        { waiting: String(msg.error || '').slice(0, 200), $push: { events: { at: now, status: 'printing', note: String(msg.error || '').slice(0, 200) } } },
      );
      return;
    case 'job.printed':
      await transition(msg.jobId, 'printed', { only: ['sent', 'printing'], filter: mine, note: 'Printed', set: { printedAt: now, waiting: '' } });
      return;
    case 'job.failed':
      if (msg.code === 'paper_out' && (await moveToAnotherPrinter(c, msg.jobId, msg.error))) return;
      await transition(msg.jobId, 'failed', {
        only: ['sent', 'printing'],
        filter: mine,
        note: msg.error,
        set: { error: String(msg.error || 'Printer error').slice(0, 300), waiting: '' },
      });
      return;
  }
}

/**
 * Every tray of a printer was empty before anything printed: try another printer
 * that can take the job. False when there is none, so the job fails and the shop sees why.
 */
async function moveToAnotherPrinter(c: Conn, jobId: string, reason: string): Promise<boolean> {
  const job = await Job.findOne({ _id: jobId, deviceId: c.deviceId, status: { $in: ['sent', 'printing'] } });
  const shop = job && (await Shop.findById(job.shopId).select('printers').lean());
  if (!job || !shop) return false;
  const tried = [...new Set([...(job.triedPrinters ?? []), job.printer])];
  const ids = byShop.get(c.shopId) ?? new Set<string>();
  const others = [...ids].flatMap((id) => conns.get(id)?.printers ?? []);
  if (!others.some((p) => printerFits(p, { ...job.toObject(), triedPrinters: tried }, shop.printers as ShopPrinters))) return false;
  const moved = await Job.findOneAndUpdate(
    { _id: job._id, status: { $in: ['sent', 'printing'] } },
    {
      $set: { status: 'queued', deviceId: null, acceptedAt: null, waiting: '', triedPrinters: tried },
      $push: { events: { at: new Date(), status: 'queued', note: `${job.printer}: ${reason}. Moving to another printer.` } },
    },
  );
  if (moved) await dispatchShop(c.shopId);
  return Boolean(moved);
}

async function onDisconnect(deviceId: string, shopId: string) {
  await Device.updateOne({ _id: deviceId }, { online: false });
  // Anything handed over but not yet confirmed goes back to the queue for another PC (or this one later).
  const stuck = await Job.find({ deviceId, status: 'sent', acceptedAt: null }).select('_id');
  for (const j of stuck) await transition(j._id, 'queued', { only: ['sent'], note: 'Shop PC disconnected, re-queued' });
  if (stuck.length) await dispatchShop(shopId);
}

/** Old records stored one printer name; newer ones a list. */
export function printerList(v: unknown): string[] {
  return ([] as unknown[]).concat(v ?? []).filter((x): x is string => typeof x === 'string' && x !== '');
}

interface ShopPrinters {
  bw?: unknown;
  color?: unknown;
  duplex?: unknown;
  photo?: unknown;
}

export interface JobNeeds {
  mode?: string | null;
  sides?: string | null;
  kind?: string | null;
  triedPrinters?: string[] | null;
}

/** The printers assigned to this kind of job. Photos fall back to the colour printers. */
function assignedFor(job: JobNeeds, assigned: ShopPrinters | null | undefined): string[] {
  if (job.kind === 'photo') {
    const photo = printerList(assigned?.photo);
    return photo.length ? photo : printerList(assigned?.color);
  }
  return printerList(job.mode === 'color' ? assigned?.color : assigned?.bw);
}

/** Whether this printer is allowed to take a job of this kind. */
export function printerFits(p: AgentPrinter, job: JobNeeds, assigned: ShopPrinters | null | undefined): boolean {
  const wanted = assignedFor(job, assigned);
  if (p.status === 'offline' || (wanted.length > 0 && !wanted.includes(p.name))) return false;
  if (job.triedPrinters?.includes(p.name)) return false;
  if (job.sides !== 'double' || job.kind === 'photo') return true;
  const duplex = printerList(assigned?.duplex);
  return duplex.length ? duplex.includes(p.name) : Boolean(p.duplex);
}

/**
 * Pick a connected PC and printer for this job, or null if none can take it now.
 * Assigned printers: the ready one with the least work wins, so jobs spread out
 * and a jammed printer is skipped. Nothing assigned: the PC's default printer.
 */
function route(job: JobDoc, assigned: ShopPrinters, devices: Conn[], load: Map<string, number>): { c: Conn; printer: string } | null {
  const wanted = assignedFor(job, assigned);
  const options = devices.flatMap((c) => c.printers.map((p) => ({ c, p }))).filter(({ p }) => printerFits(p, job, assigned));
  if (!options.length) return null;
  const rank = ({ p }: (typeof options)[number]) =>
    [p.status === 'ready' ? 0 : 1, wanted.length ? (load.get(p.name) ?? 0) : p.isDefault ? 0 : 1, wanted.length ? wanted.indexOf(p.name) : (load.get(p.name) ?? 0)] as const;
  options.sort((x, y) => {
    const [a, b] = [rank(x), rank(y)];
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
  return { c: options[0]!.c, printer: options[0]!.p.name };
}

type TrayConfig = { printer?: string | null; docs?: string[] | null; photos?: string[] | null }[];

/** The shop's tray order for this printer and kind of job, keeping only trays the printer still has. */
function traysFor(job: JobDoc, printer: string, trays: TrayConfig | null | undefined, available: AgentPrinter | undefined): string[] {
  const config = trays?.find((t) => t.printer === printer);
  const order = printerList(job.kind === 'photo' ? config?.photos : config?.docs);
  const exists = available?.trays;
  return exists?.length ? order.filter((t) => exists.includes(t)) : order;
}

export function orderFor(job: JobDoc, printer: string, trays: string[] = []): JobOrder {
  return {
    jobId: String(job._id),
    printer,
    copies: job.copies,
    color: job.mode === 'color',
    duplex: job.sides === 'double' && job.kind !== 'photo',
    ...(job.kind === 'photo' ? { kind: 'photo' as const, paper: job.photo?.paper ?? 'A4' } : {}),
    trays,
    pages: job.printPages ?? job.file.pages,
    fileName: job.file.name,
    fileUrl: `/api/agent/jobs/${job._id}/file`,
    pickupCode: job.pickupCode,
  };
}

/** Hand every queued job of this shop to a connected PC. */
export async function dispatchShop(shopId: string | Types.ObjectId) {
  const ids = byShop.get(String(shopId));
  if (!ids?.size) return;
  const devices = [...ids].map((id) => conns.get(id)!).filter(Boolean);
  const shop = await Shop.findById(shopId).select('printers trays').lean();
  if (!shop) return;

  const queued = await Job.find({ shopId, status: 'queued' }).sort({ createdAt: 1 }).limit(20);
  if (!queued.length) return;
  const busy = await Job.aggregate([
    { $match: { shopId: new mongoose.Types.ObjectId(String(shopId)), status: { $in: ['sent', 'printing'] } } },
    { $group: { _id: '$printer', jobs: { $sum: 1 } } },
  ]);
  const load = new Map<string, number>(busy.map((b) => [String(b._id), b.jobs as number]));
  for (const job of queued) {
    const r = route(job, shop.printers as ShopPrinters, devices, load);
    if (!r) continue;
    const claimed = await transition(job._id, 'sent', {
      only: ['queued'],
      note: `Sent to ${r.printer}`,
      set: { deviceId: r.c.deviceId, printer: r.printer, sentAt: new Date(), acceptedAt: null, waiting: '' },
    });
    if (claimed) {
      load.set(r.printer, (load.get(r.printer) ?? 0) + 1);
      const trays = traysFor(claimed, r.printer, shop.trays as TrayConfig, r.c.printers.find((p) => p.name === r.printer));
      send(r.c, { type: 'job', job: orderFor(claimed, r.printer, trays) });
    }
  }
}

async function sweep() {
  if (!byShop.size) return;
  // Re-queue jobs a PC never confirmed (lost message, crashed agent).
  const cutoff = new Date(Date.now() - config.ackTimeoutSeconds * 1000);
  const local = [...conns.keys()];
  const stale = await Job.find({ deviceId: { $in: local }, status: 'sent', acceptedAt: null, sentAt: { $lt: cutoff } }).select('_id');
  for (const j of stale) await transition(j._id, 'queued', { only: ['sent'], note: 'No answer from shop PC, re-queued' });

  const shops = [...byShop.entries()].filter(([, s]) => s.size).map(([id]) => id);
  const waiting: string[] = (await Job.distinct('shopId', { status: 'queued', shopId: { $in: shops } })).map(String);
  for (const id of waiting) await dispatchShop(id);
}

/** Send a test page to one printer of a connected PC. Returns false if the PC isn't on this server. */
export function sendTestPage(deviceId: string, printer: string, shopCode: string): boolean {
  const c = conns.get(deviceId);
  if (!c) return false;
  send(c, {
    type: 'job',
    job: {
      jobId: `test-${crypto.randomBytes(4).toString('hex')}`,
      printer,
      copies: 1,
      color: true,
      duplex: false,
      pages: 1,
      fileName: 'Test page.pdf',
      fileUrl: `/api/agent/test-page?printer=${encodeURIComponent(printer)}`,
      pickupCode: shopCode,
    },
  });
  return true;
}

export function connectedHere(deviceId: string) {
  return conns.has(deviceId);
}
