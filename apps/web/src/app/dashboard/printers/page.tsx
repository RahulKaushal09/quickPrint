'use client';

import { Copy, Download, FileCheck2, Monitor, Plus, Printer, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Badge, Button, Card, Dot, Empty, Field, Modal, Select, Skeleton, useToast } from '@/components/ui';
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
  printers: { name: string; status: string; isDefault: boolean }[];
}

const PRINTER_STATUS: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' | 'neutral' }> = {
  ready: { label: 'Ready', tone: 'ok' },
  busy: { label: 'Busy', tone: 'warn' },
  offline: { label: 'Offline', tone: 'neutral' },
  paper_out: { label: 'Out of paper', tone: 'bad' },
  jammed: { label: 'Paper jam', tone: 'bad' },
  error: { label: 'Needs attention', tone: 'bad' },
};

const AGENT_DOWNLOAD = '/downloads/QuickPrintAgent-Setup.exe';

export default function PrintersPage() {
  const { shop, setShop } = useShop();
  const toast = useToast();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [routing, setRouting] = useState(shop.printers);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api<{ devices: Device[] }>('/api/shop/devices').then((r) => setDevices(r.devices)), []);
  useEffect(() => {
    void load();
    const t = setInterval(() => !document.hidden && load().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [load]);

  const allPrinters = [...new Set((devices ?? []).flatMap((d) => d.printers.map((p) => p.name)))];
  const dirty = routing.bw !== shop.printers.bw || routing.color !== shop.printers.color;

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
        description="The shop PC runs the QuickPrint Agent and prints paid jobs on these printers."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setPairOpen(true)}>
            Add shop PC
          </Button>
        }
      />

      {/* Routing */}
      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-bold">Which printer prints what</h2>
          <p className="text-sm text-ink-mute">Leave on automatic to use the PC&rsquo;s default printer.</p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Black & white jobs go to">
            <Select value={routing.bw} onChange={(e) => setRouting({ ...routing, bw: e.target.value })}>
              <option value="">Automatic (default printer)</option>
              {allPrinters.map((p) => <option key={p}>{p}</option>)}
              {routing.bw && !allPrinters.includes(routing.bw) && <option value={routing.bw}>{routing.bw} (not connected)</option>}
            </Select>
          </Field>
          <Field label="Colour jobs go to" hint={!shop.rates.colorEnabled ? 'Colour printing is switched off in Settings.' : undefined}>
            <Select value={routing.color} onChange={(e) => setRouting({ ...routing, color: e.target.value })}>
              <option value="">Automatic (default printer)</option>
              {allPrinters.map((p) => <option key={p}>{p}</option>)}
              {routing.color && !allPrinters.includes(routing.color) && <option value={routing.color}>{routing.color} (not connected)</option>}
            </Select>
          </Field>
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
            Install the QuickPrint Agent on the computer your printers are connected to. It works on Windows 7, 8, 10 and 11.
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a href={AGENT_DOWNLOAD} download>
                <Button variant="secondary" icon={<Download className="size-4" />}>
                  Download agent
                </Button>
              </a>
              <Button onClick={() => setPairOpen(true)}>Get pairing code</Button>
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
                  const roles = [shop.printers.bw === p.name && 'B/W', shop.printers.color === p.name && 'Colour'].filter(Boolean);
                  return (
                    <li key={p.name} className="flex items-center gap-3 px-5 py-3">
                      <Printer className="size-4.5 shrink-0 text-ink-mute" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge tone={d.online ? s.tone : 'neutral'}>{d.online ? s.label : 'PC offline'}</Badge>
                          {p.isDefault && <Badge>Default</Badge>}
                          {roles.map((r) => <Badge key={String(r)} tone="ink">{r} jobs</Badge>)}
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" disabled={!d.online} icon={<FileCheck2 className="size-4" />} onClick={() => test(d, p.name)}>
                        Test page
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {d.version && <p className="border-t border-line bg-paper px-5 py-2 text-xs text-ink-mute">Agent v{d.version}</p>}
            </Card>
          ))}
        </div>
      )}

      <PairModal open={pairOpen} onClose={() => { setPairOpen(false); void load(); }} />
    </>
  );
}

function PairModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState<{ code: string; expiresAt: string; server: string } | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!open) return;
    setCode(null);
    api('/api/shop/devices/pair-code', { method: 'POST' }).then(setCode).catch((e) => toast(e.message, 'bad'));
  }, [open, toast]);

  useEffect(() => {
    if (!code) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(code.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [code]);

  return (
    <Modal open={open} onClose={onClose} title="Connect a shop PC" wide>
      <ol className="space-y-6">
        <Step n={1} title="Download the agent on the shop PC">
          <p>Use the computer your printers are connected to. Works on Windows 7, 8, 10 and 11.</p>
          <a href={AGENT_DOWNLOAD} download className="mt-3 inline-block">
            <Button variant="secondary" icon={<Download className="size-4" />}>
              QuickPrintAgent-Setup.exe
            </Button>
          </a>
          <p className="mt-2 text-xs">If Windows shows &ldquo;Windows protected your PC&rdquo;, click More info &rarr; Run anyway.</p>
        </Step>
        <Step n={2} title="Type this code when the installer asks">
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border-2 border-dashed border-line-strong bg-paper px-6 py-3 font-mono text-3xl font-bold tracking-[0.25em] tabular">
              {code ? `${code.code.slice(0, 4)}-${code.code.slice(4)}` : '····-····'}
            </div>
            {code && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Copy className="size-4" />}
                onClick={() => navigator.clipboard.writeText(code.code).then(() => toast('Code copied'))}
              >
                Copy
              </Button>
            )}
          </div>
          {code && (
            <p className={cx('mt-2 text-xs', left < 120 ? 'font-semibold text-bad' : '')}>
              {left > 0 ? `Works once. Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Expired. Close and open this again for a new code.'}
            </p>
          )}
        </Step>
        <Step n={3} title="That's it">
          <p>The PC appears on this page within a few seconds, with its printers. Send a test page to check.</p>
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
