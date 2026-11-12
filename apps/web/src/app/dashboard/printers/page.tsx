'use client';

import { ChevronDown, ChevronUp, Download, ExternalLink, Layers, FileCheck2, Monitor, Plus, Printer, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Badge, Button, Card, Dot, Empty, Field, Input, Modal, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { useShop, type PrinterSetting, type ShopData as Shop } from '../shop-context';

interface Device {
  id: string;
  name: string;
  os: string;
  version: string;
  online: boolean;
  lastSeenAt?: string;
  printers: AgentPrinter[];
}

interface AgentPrinter {
  name: string;
  status: string;
  isDefault: boolean;
  duplex?: boolean;
  trays?: string[];
  driver?: string;
  location?: string;
  comment?: string;
}

/** How a printer prints both sides. Mirrors sidesOf() in the API. */
function sidesOf(p: AgentPrinter, shop: Shop): 'auto' | 'manual' | 'off' {
  const chosen = shop.printerSettings.find((s) => s.printer === p.name)?.sides;
  if (chosen) return chosen;
  return (shop.printers.duplex.length ? shop.printers.duplex.includes(p.name) : p.duplex) ? 'auto' : 'off';
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
  const labelOf = (name: string) => shop.printerSettings.find((s) => s.printer === name)?.label || name;
  const [settingsFor, setSettingsFor] = useState<{ device: Device; printer: AgentPrinter } | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  /** Ask the PC to read its printers again, then show what it found. */
  async function refresh(d: Device) {
    setRefreshing(d.id);
    try {
      await api(`/api/shop/devices/${d.id}/refresh`, { method: 'POST' });
      await new Promise((r) => setTimeout(r, 2500));
      await load();
      toast('Printer list updated');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setRefreshing(null);
    }
  }
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
      toast(`Test page sent to ${labelOf(printer)}`);
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
        <p className="mt-1 text-sm text-ink-mute">Tick one or more for each type. Jobs go to the ready printer with the least work, and skip one that is jammed or out of paper. With none ticked, the PC&rsquo;s default printer is used for B/W and colour. Set each printer&rsquo;s name and both-sides printing with its Settings button below.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <PrinterPicker title="Black & white jobs" value={routing.bw} all={allPrinters} labelOf={labelOf} onChange={(bw) => setRouting({ ...routing, bw })} />
          <PrinterPicker title="Colour jobs" hint={!shop.rates.colorEnabled ? 'Colour printing is switched off in Settings.' : undefined} value={routing.color} all={allPrinters} labelOf={labelOf} onChange={(color) => setRouting({ ...routing, color })} />
          <PrinterPicker title="Passport photos" emptyHint="Automatic: the colour printers" hint={!shop.photos.enabled ? 'Passport photos are switched off in Settings.' : undefined} value={routing.photo} all={allPrinters} labelOf={labelOf} onChange={(photo) => setRouting({ ...routing, photo })} />
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
                <Button variant="ghost" size="sm" loading={refreshing === d.id} disabled={!d.online} icon={<RefreshCw className="size-4" />} onClick={() => refresh(d)}>
                  Refresh
                </Button>
                <button onClick={() => remove(d)} className="grid size-9 place-items-center rounded-lg text-ink-mute hover:bg-bad-soft hover:text-bad" aria-label="Disconnect PC" title="Disconnect PC">
                  <Trash2 className="size-4" />
                </button>
              </div>
              {d.id === thisPc && desktop?.addPrinter && (
                <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-5 py-3">
                  <p className="mr-auto text-sm text-ink-mute">New printer? Add it in Windows, then press Refresh.</p>
                  <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => desktop.addPrinter?.()}>
                    Add a printer
                  </Button>
                  <Button variant="ghost" size="sm" icon={<ExternalLink className="size-4" />} onClick={() => desktop.printerSettings?.()}>
                    Windows printers
                  </Button>
                </div>
              )}
              <ul className="divide-y divide-line">
                {d.printers.length === 0 && <li className="px-5 py-4 text-sm text-ink-mute">No printers found on this PC. Install the printer driver in Windows first.</li>}
                {d.printers.map((p) => {
                  const s = PRINTER_STATUS[p.status] ?? PRINTER_STATUS.error!;
                  const roles = [shop.printers.bw.includes(p.name) && 'B/W', shop.printers.color.includes(p.name) && 'Colour'].filter(Boolean);
                  const sides = sidesOf(p, shop);
                  const label = labelOf(p.name);
                  const windowsNote = [label !== p.name && p.name, p.driver && p.driver !== p.name && p.driver, p.location, p.comment].filter(Boolean).join(' · ');
                  return (
                    <li key={p.name} className="flex items-center gap-3 px-5 py-3">
                      <Printer className="size-4.5 shrink-0 text-ink-mute" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{label}</p>
                        {windowsNote && <p className="truncate text-xs text-ink-mute" title={windowsNote}>{windowsNote}</p>}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge tone={d.online ? s.tone : 'neutral'}>{d.online ? s.label : 'PC offline'}</Badge>
                          {p.isDefault && <Badge>Default</Badge>}
                          {sides === 'auto' && <Badge tone="cyan">Both sides</Badge>}
                          {sides === 'manual' && <Badge tone="cyan">Both sides by hand</Badge>}
                          {shop.trays.some((t) => t.printer === p.name && (t.docs.length || t.photos.length)) && <Badge tone="ink">Tray order set</Badge>}
                          {roles.map((r) => <Badge key={String(r)} tone="ink">{r} jobs</Badge>)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                        <Button variant="ghost" size="sm" icon={<Settings2 className="size-4" />} onClick={() => setSettingsFor({ device: d, printer: p })}>
                          Settings
                        </Button>
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
      {settingsFor && <PrinterModal device={settingsFor.device} printer={settingsFor.printer} onClose={() => setSettingsFor(null)} />}
      <PairModal open={pairOpen} onClose={() => { setPairOpen(false); void load(); }} />
    </>
  );
}

const SIDES: { value: PrinterSetting['sides']; title: string; text: string }[] = [
  { value: 'auto', title: 'Automatic', text: 'The printer turns the paper over by itself.' },
  { value: 'manual', title: 'By hand', text: 'Fronts print first. Then the shop PC asks you to put the pages back in the tray, and prints the backs.' },
  { value: 'off', title: 'Off', text: 'Never send both-sides jobs to this printer.' },
];

/** One printer's own settings: the shop's name for it and how it prints both sides. */
function PrinterModal({ device, printer, onClose }: { device: Device; printer: AgentPrinter; onClose: () => void }) {
  const { shop, setShop } = useShop();
  const toast = useToast();
  const saved = shop.printerSettings.find((s) => s.printer === printer.name);
  const [label, setLabel] = useState(saved?.label ?? '');
  const [sides, setSides] = useState<PrinterSetting['sides']>(sidesOf(printer, shop));
  const [reverseBacks, setReverseBacks] = useState(saved?.reverseBacks ?? false);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  async function save(thenTest: boolean) {
    setBusy(thenTest ? 'test' : 'save');
    try {
      const printerSettings = [...shop.printerSettings.filter((s) => s.printer !== printer.name), { printer: printer.name, label: label.trim(), sides, reverseBacks }];
      const r = await api('/api/shop', { method: 'PATCH', json: { printerSettings } });
      setShop(r.shop);
      if (thenTest) {
        await api(`/api/shop/devices/${device.id}/test`, { method: 'POST', json: { printer: printer.name, bothSides: true } });
        toast(sides === 'manual' ? 'Test sent. The shop PC will ask you to turn the pages over.' : 'Both-sides test sent');
      } else {
        toast('Printer settings saved');
        onClose();
      }
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="Printer settings" wide>
      <p className="text-sm text-ink-mute">
        Windows name: <span className="font-semibold text-ink">{printer.name}</span>
        {printer.driver && printer.driver !== printer.name && <> · {printer.driver}</>}
        {printer.location && <> · {printer.location}</>}
      </p>
      <Field label="Your name for this printer" hint="Shown in the dashboard and on the shop PC. Leave empty to use the Windows name." className="mt-5">
        <Input value={label} maxLength={40} placeholder={printer.name} onChange={(e) => setLabel(e.target.value)} />
      </Field>

      <p className="mt-6 text-sm font-semibold">Printing on both sides</p>
      <p className="mt-1 text-xs text-ink-mute">
        Windows says this printer {printer.duplex ? 'can' : 'cannot'} print both sides by itself. If both-sides jobs come out as separate pages, choose By hand.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {SIDES.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setSides(o.value)}
            className={cx('rounded-xl border p-3 text-left transition', sides === o.value ? 'border-ink bg-paper ring-1 ring-ink' : 'border-line hover:border-line-strong')}
          >
            <p className="text-sm font-bold">{o.title}</p>
            <p className="mt-1 text-xs text-ink-mute">{o.text}</p>
          </button>
        ))}
      </div>
      {sides === 'manual' && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[#0b1220]" checked={reverseBacks} onChange={(e) => setReverseBacks(e.target.checked)} />
          <span>
            <span className="font-semibold">Print the backs last page first</span>
            <span className="mt-0.5 block text-xs text-ink-mute">Turn this on if the test puts page 4 behind page 1.</span>
          </span>
        </label>
      )}
      {sides !== 'off' && (
        <p className="mt-3 text-xs text-ink-mute">Print the both-sides test: 2 sheets with pages 1 to 4. Page 2 should be behind page 1, the same way up.</p>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {sides !== 'off' && (
          <Button variant="secondary" loading={busy === 'test'} disabled={busy !== null || !device.online} icon={<FileCheck2 className="size-4" />} onClick={() => save(true)}>
            Save and print test
          </Button>
        )}
        <Button loading={busy === 'save'} disabled={busy !== null} onClick={() => save(false)}>
          Save
        </Button>
      </div>
    </Modal>
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

function PrinterPicker({ title, hint, emptyHint, value, all, labelOf, onChange }: { title: string; hint?: string; emptyHint?: string; value: string[]; all: string[]; labelOf: (name: string) => string; onChange: (v: string[]) => void }) {
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
              <span className="min-w-0 flex-1 truncate" title={p}>{labelOf(p)}</span>
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
