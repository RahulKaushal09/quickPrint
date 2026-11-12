'use client';

import { ChevronDown, ChevronUp, Download, Layers, FileCheck2, Monitor, Plus, Printer, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Badge, Button, Card, Dot, Empty, Modal, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { useShop } from '../shop-context';

interface Device {
  id: string;
  name: string;
  os: string;
  version: string;
  online: boolean;
  lastSeenAt?: string;
  printers: { name: string; status: string; isDefault: boolean; duplex?: boolean; trays?: string[] }[];
}

const PRINTER_STATUS: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' | 'neutral' }> = {
  ready: { label: 'Ready', tone: 'ok' },
  busy: { label: 'Busy', tone: 'warn' },
  offline: { label: 'Offline', tone: 'neutral' },
  paper_out: { label: 'Out of paper', tone: 'bad' },
  jammed: { label: 'Paper jam', tone: 'bad' },
  error: { label: 'Needs attention', tone: 'bad' },
};

const APP_DOWNLOAD = '/downloads/SeedhaPrint-Setup.exe';

export default function PrintersPage() {
  const { shop, setShop } = useShop();
  const toast = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [routing, setRouting] = useState(shop.printers);
  const [saving, setSaving] = useState(false);
  const desktop = typeof window !== 'undefined' ? window.seedhaPrintDesktop : undefined;
  const [connecting, setConnecting] = useState(false);
  const [thisPc, setThisPc] = useState<string | null>(null);
  useEffect(() => {
    desktop?.deviceId().then(setThisPc).catch(() => {});
  }, [desktop]);
  // Connecting twice would list this computer twice.
  const needsConnect = Boolean(desktop && devices && !devices.some((d) => d.id === thisPc));

  /** Inside the desktop app, connecting this PC takes one click: no code to type. */
  async function connectThisPc() {
    if (!desktop) return;
    setConnecting(true);
    try {
      const { code, server } = await api('/api/shop/devices/pair-code', { method: 'POST' });
      const message = await desktop.pair(code, server);
      setThisPc(await desktop.deviceId());
      toast(message);
      await load();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setConnecting(false);
    }
  }

  const load = useCallback(() => api<{ devices: Device[] }>('/api/shop/devices').then((r) => setDevices(r.devices)), []);
  useEffect(() => {
    void load();
    const t = setInterval(() => !document.hidden && load().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [load]);

  const allPrinters = [...new Set((devices ?? []).flatMap((d) => d.printers.map((p) => p.name)))];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((p) => b.includes(p));
  const dirty = (['bw', 'color', 'duplex', 'photo'] as const).some((k) => !same(routing[k], shop.printers[k]));
  const [trayPrinter, setTrayPrinter] = useState<{ name: string; trays: string[] } | null>(null);

  async function saveRouting() {
    setSaving(true);
    try {
      const r = await api('/api/shop', { method: 'PATCH', json: { printers: routing } });
      setShop(r.shop);
      toast('Printer choice saved');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setSaving(false);
    }
  }

  async function test(d: Device, printer: string) {
    try {
      await api(`/api/shop/devices/${d.id}/test`, { method: 'POST', json: { printer } });
      toast(`Test page sent to ${printer}`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

  async function remove(d: Device) {
    if (!confirm(`Disconnect "${d.name}"? It will stop printing until you pair it again.`)) return;
    await api(`/api/shop/devices/${d.id}`, { method: 'DELETE' });
    toast('PC disconnected');
    void load();
  }

  return (
    <>
      <PageHeader
        title="Printers"
        description="Customer jobs print by themselves on the printers of your connected shop PCs."
        actions={
          desktop ? (
            needsConnect ? (
              <Button loading={connecting} icon={<Plus className="size-4" />} onClick={connectThisPc}>
                Connect this PC
              </Button>
            ) : undefined
          ) : (
            <Button icon={<Plus className="size-4" />} onClick={() => setPairOpen(true)}>
              Add shop PC
            </Button>
          )
        }
      />

      {/* Routing */}
      <Card className="mb-6 p-5 sm:p-6">
        <h2 className="text-lg font-bold">Which printers print what</h2>
        <p className="mt-1 text-sm text-ink-mute">Tick one or more for each type. Jobs go to the ready printer with the least work, and skip one that is jammed or out of paper. With none ticked, the PC&rsquo;s default printer is used for B/W and colour.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <PrinterPicker title="Black & white jobs" value={routing.bw} all={allPrinters} onChange={(bw) => setRouting({ ...routing, bw })} />
          <PrinterPicker title="Colour jobs" hint={!shop.rates.colorEnabled ? 'Colour printing is switched off in Settings.' : undefined} value={routing.color} all={allPrinters} onChange={(color) => setRouting({ ...routing, color })} />
          <PrinterPicker title="Both-sides jobs" emptyHint="Automatic: printers Windows says can do it" hint={!shop.rates.duplexEnabled ? 'Printing on both sides is switched off in Settings.' : undefined} value={routing.duplex} all={allPrinters} onChange={(duplex) => setRouting({ ...routing, duplex })} />
          <PrinterPicker title="Passport photos" emptyHint="Automatic: the colour printers" hint={!shop.photos.enabled ? 'Passport photos are switched off in Settings.' : undefined} value={routing.photo} all={allPrinters} onChange={(photo) => setRouting({ ...routing, photo })} />
        </div>
        {dirty && (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRouting(shop.printers)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={saveRouting}>
              Save
            </Button>
          </div>
        )}
      </Card>

      {/* PCs */}
      {!devices ? (
        <Skeleton className="h-48" />
      ) : devices.length === 0 ? (
        <Card>
          <Empty icon={<Monitor className="size-6" />} title="No shop PC connected">
            {desktop ? 'Connect this computer to start printing.' : 'Install the SeedhaPrint app on the computer your printers are connected to. It works on Windows 7, 8, 10 and 11.'}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {desktop ? (
                <Button loading={connecting} onClick={connectThisPc}>
                  Connect this PC
                </Button>
              ) : (
                <>
                  <a href={APP_DOWNLOAD} download>
                    <Button variant="secondary" icon={<Download className="size-4" />}>
                      Download app
                    </Button>
                  </a>
                  <Button onClick={() => setPairOpen(true)}>How to connect</Button>
                </>
              )}
            </div>
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {devices.map((d) => (
            <Card key={d.id} className="overflow-hidden">
              <div className="flex items-start gap-4 border-b border-line p-5">
                <div className={cx('grid size-11 shrink-0 place-items-center rounded-xl', d.online ? 'bg-ink text-white' : 'bg-paper-2 text-ink-mute')}>
                  <Monitor className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold">{d.name}</p>
                    <Dot on={d.online} pulse />
                  </div>
                  <p className="truncate text-sm text-ink-mute">
                    {d.online ? 'Connected' : `Offline · last seen ${timeAgo(d.lastSeenAt)}`}
                    {d.os && ` · ${d.os}`}
                  </p>
                </div>
                <button onClick={() => remove(d)} className="grid size-9 place-items-center rounded-lg text-ink-mute hover:bg-bad-soft hover:text-bad" aria-label="Disconnect PC" title="Disconnect PC">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <ul className="divide-y divide-line">
                {d.printers.length === 0 && <li className="px-5 py-4 text-sm text-ink-mute">No printers found on this PC. Install the printer driver in Windows first.</li>}
                {d.printers.map((p) => {
                  const s = PRINTER_STATUS[p.status] ?? PRINTER_STATUS.error!;
                  const roles = [shop.printers.bw.includes(p.name) && 'B/W', shop.printers.color.includes(p.name) && 'Colour'].filter(Boolean);
                  const bothSides = shop.printers.duplex.length ? shop.printers.duplex.includes(p.name) : p.duplex;
                  return (
                    <li key={p.name} className="flex items-center gap-3 px-5 py-3">
                      <Printer className="size-4.5 shrink-0 text-ink-mute" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge tone={d.online ? s.tone : 'neutral'}>{d.online ? s.label : 'PC offline'}</Badge>
                          {p.isDefault && <Badge>Default</Badge>}
                          {bothSides && <Badge tone="cyan">Both sides</Badge>}
                          {shop.trays.some((t) => t.printer === p.name && (t.docs.length || t.photos.length)) && <Badge tone="ink">Tray order set</Badge>}
                          {roles.map((r) => <Badge key={String(r)} tone="ink">{r} jobs</Badge>)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                        {Boolean(p.trays?.length) && (
                          <Button variant="ghost" size="sm" icon={<Layers className="size-4" />} onClick={() => setTrayPrinter({ name: p.name, trays: p.trays! })}>
                            Trays
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" disabled={!d.online} icon={<FileCheck2 className="size-4" />} onClick={() => test(d, p.name)}>
                          Test page
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {d.version && <p className="border-t border-line bg-paper px-5 py-2 text-xs text-ink-mute">Agent v{d.version}</p>}
            </Card>
          ))}
        </div>
      )}

      {trayPrinter && <TrayModal printer={trayPrinter} onClose={() => setTrayPrinter(null)} />}
      <PairModal open={pairOpen} onClose={() => { setPairOpen(false); void load(); }} />
    </>
  );
}

/**
 * A printer's trays in order of preference, for documents and photos. A job
 * starts on the first ticked tray; if that one is out of paper before anything
 * prints, the next takes over, and after the last one another printer does.
 */
function TrayModal({ printer, onClose }: { printer: { name: string; trays: string[] }; onClose: () => void }) {
  const { shop, setShop } = useShop();
  const toast = useToast();
  const saved = shop.trays.find((t) => t.printer === printer.name);
  const [docs, setDocs] = useState(saved?.docs ?? []);
  const [photos, setPhotos] = useState(saved?.photos ?? []);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const trays = [...shop.trays.filter((t) => t.printer !== printer.name), ...(docs.length || photos.length ? [{ printer: printer.name, docs, photos }] : [])];
      const r = await api('/api/shop', { method: 'PATCH', json: { trays } });
      setShop(r.shop);
      toast('Tray order saved');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Trays: ${printer.name}`} wide>
      <p className="text-sm text-ink-mute">Tick the trays to use, in order. A job starts on tray 1. If that tray runs out of paper before anything prints, the next one takes over, and after the last one the job moves to another printer. With none ticked, the printer chooses.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <TrayList title="Documents" all={printer.trays} value={docs} onChange={setDocs} />
        <TrayList title="Passport photos" all={printer.trays} value={photos} onChange={setPhotos} />
      </div>
      <p className="mt-4 text-xs text-ink-mute">Not every printer tells Windows when a tray is empty. Send a test with one tray empty to check yours.</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </Modal>
  );
}

function TrayList({ title, all, value, onChange }: { title: string; all: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const items = [...value.filter((t) => all.includes(t)), ...all.filter((t) => !value.includes(t))];
  const move = (tray: string, by: number) => {
    const next = [...value];
    const i = next.indexOf(tray);
    next.splice(i, 1);
    next.splice(i + by, 0, tray);
    onChange(next);
  };
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-0.5 text-xs text-ink-mute">{value.length ? `${value.length} in order` : 'Printer chooses'}</p>
      <ul className="mt-3 space-y-1.5">
        {items.map((tray) => {
          const at = value.indexOf(tray);
          const on = at >= 0;
          return (
            <li key={tray} className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm', on ? 'border-ink bg-paper' : 'border-line')}>
              <input type="checkbox" className="size-4 accent-[#0b1220]" checked={on} onChange={() => onChange(on ? value.filter((t) => t !== tray) : [...value, tray])} aria-label={`Use ${tray}`} />
              {on && <span className="grid size-6 place-items-center rounded-full bg-ink font-mono text-xs font-bold text-white">{at + 1}</span>}
              <span className="min-w-0 flex-1 truncate font-semibold">{tray}</span>
              {on && (
                <span className="flex">
                  <button type="button" disabled={at === 0} onClick={() => move(tray, -1)} className="grid size-8 place-items-center rounded-lg hover:bg-paper-2 disabled:opacity-25" aria-label={`Move ${tray} up`}>
                    <ChevronUp className="size-4" />
                  </button>
                  <button type="button" disabled={at === value.length - 1} onClick={() => move(tray, 1)} className="grid size-8 place-items-center rounded-lg hover:bg-paper-2 disabled:opacity-25" aria-label={`Move ${tray} down`}>
                    <ChevronDown className="size-4" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PrinterPicker({ title, hint, emptyHint, value, all, onChange }: { title: string; hint?: string; emptyHint?: string; value: string[]; all: string[]; onChange: (v: string[]) => void }) {
  // A printer can be assigned while its PC is off, so it stays listed.
  const names = [...new Set([...all, ...value])];
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-0.5 text-xs text-ink-mute">{hint ?? (value.length ? `${value.length} printer${value.length === 1 ? '' : 's'} assigned` : emptyHint ?? 'Automatic: default printer')}</p>
      <div className="mt-3 space-y-1.5">
        {names.length === 0 && <p className="text-sm text-ink-mute">No printers found yet. Connect a shop PC first.</p>}
        {names.map((p) => {
          const on = value.includes(p);
          return (
            <label key={p} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition', on ? 'border-ink bg-paper' : 'border-line hover:border-line-strong')}>
              <input type="checkbox" className="size-4 accent-[#0b1220]" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== p) : [...value, p])} />
              <span className="min-w-0 flex-1 truncate">{p}</span>
              {!all.includes(p) && <Badge>Not connected</Badge>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function PairModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Connect a shop PC" wide>
      <ol className="space-y-6">
        <Step n={1} title="Download the app on the shop PC">
          <p>Use the computer your printers are connected to. Works on Windows 7, 8, 10 and 11.</p>
          <a href={APP_DOWNLOAD} download className="mt-3 inline-block">
            <Button variant="secondary" icon={<Download className="size-4" />}>
              SeedhaPrint-Setup.exe
            </Button>
          </a>
          <p className="mt-2 text-xs">If Windows shows &ldquo;Windows protected your PC&rdquo;, click More info &rarr; Run anyway.</p>
        </Step>
        <Step n={2} title="Install it and sign in">
          <p>Use this same phone number and password. The app opens by itself every time Windows starts.</p>
        </Step>
        <Step n={3} title="Click Connect this PC">
          <p>In the app, open Printers and click Connect this PC. Your printers appear here within a few seconds. Send a test page to check.</p>
        </Step>
      </ol>
      <Button className="mt-8 w-full" onClick={onClose}>
        Done
      </Button>
    </Modal>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">{n}</span>
      <div className="flex-1 pt-1 text-sm text-ink-mute">
        <p className="mb-1 text-[0.95rem] font-bold text-ink">{title}</p>
        {children}
      </div>
    </li>
  );
}
