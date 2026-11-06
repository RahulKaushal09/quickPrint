'use client';

import { ArrowUpRight, IndianRupee, Plus, QrCode, Search, Store, Wifi } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { Badge, Button, Card, Dot, Empty, Field, Input, Modal, Select, Skeleton, Switch, useToast } from '@/components/ui';
import { api, session } from '@/lib/api';
import { rupees } from '@/lib/format';

interface AdminShop {
  id: string;
  code: string;
  name: string;
  area: string;
  city: string;
  active: boolean;
  accepting: boolean;
  online: boolean;
  razorpay: { keyId: string };
  owner: { name: string; phone: string } | null;
  last30: { jobs: number; revenue: number };
  qrUrl: string;
}

interface Stats {
  shops: number;
  active: number;
  online: number;
  last30: { jobs: number; revenue: number; pages: number };
}

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; phone: string } | null>(null);
  const [shops, setShops] = useState<AdminShop[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminShop | null>(null);

  const load = useCallback(async () => {
    const [s, st] = await Promise.all([api<{ shops: AdminShop[] }>('/api/admin/shops'), api<Stats>('/api/admin/stats')]);
    setShops(s.shops);
    setStats(st);
  }, []);

  useEffect(() => {
    if (!session.token()) return router.replace('/login');
    session.setViewShop(null);
    // The token says who we are; a 403 from /admin sends shop owners to their dashboard.
    load().catch((e) => (e.status === 403 ? router.replace('/dashboard') : null));
    setMe({ name: 'Admin', phone: '' });
    const t = setInterval(() => !document.hidden && load().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [load, router]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!shops || !s) return shops;
    return shops.filter((x) => [x.name, x.code, x.city, x.area, x.owner?.phone, x.owner?.name].some((v) => v?.toLowerCase().includes(s)));
  }, [shops, q]);

  function openShop(s: AdminShop) {
    session.setViewShop(s.id);
    router.push('/dashboard');
  }

  return (
    <AppShell nav={[{ href: '/admin', label: 'Shops', icon: Store }]} title="SeedhaPrint admin" subtitle="All shops" user={me}>
      <PageHeader
        title="Shops"
        description="Every print shop on SeedhaPrint."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Add shop
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi label="Shops" value={stats ? `${stats.active}` : null} sub={stats ? `${stats.shops - stats.active} paused` : ''} icon={<Store className="size-4" />} />
        <Kpi label="Online now" value={stats ? `${stats.online}` : null} sub="PCs connected" icon={<Wifi className="size-4" />} />
        <Kpi label="Jobs, 30 days" value={stats ? stats.last30.jobs.toLocaleString('en-IN') : null} sub={stats ? `${stats.last30.pages.toLocaleString('en-IN')} pages` : ''} icon={<QrCode className="size-4" />} />
        <Kpi label="Paid by customers, 30 days" value={stats ? rupees(stats.last30.revenue) : null} sub="Into the shops' own accounts" icon={<IndianRupee className="size-4" />} />
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <Search className="size-4 text-ink-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by shop, code, city or owner phone" className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-mute" />
          {shops && <span className="text-xs font-semibold text-ink-mute">{filtered?.length} shops</span>}
        </div>
        {!filtered ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <Empty icon={<Store className="size-6" />} title={q ? 'No shops match' : 'No shops yet'}>
            {!q && 'Add the first shop to generate its QR code and owner login.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-mute">
                  <th className="px-5 py-3">Shop</th>
                  <th className="px-3 py-3">Owner</th>
                  <th className="px-3 py-3">PC</th>
                  <th className="px-3 py-3 text-right">Jobs 30d</th>
                  <th className="px-3 py-3 text-right">Paid 30d</th>
                  <th className="px-3 py-3">Razorpay</th>
                  <th className="px-3 py-3">Active</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((s) => (
                  <tr key={s.id} className="transition hover:bg-paper/60">
                    <td className="px-5 py-3">
                      <button onClick={() => setEditing(s)} className="text-left">
                        <p className="font-semibold hover:underline">{s.name}</p>
                        <p className="text-xs text-ink-mute">
                          <span className="font-mono">{s.code}</span> · {[s.area, s.city].filter(Boolean).join(', ')}
                        </p>
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <p>{s.owner?.name ?? '-'}</p>
                      <p className="text-xs text-ink-mute">{s.owner?.phone}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2">
                        <Dot on={s.online} /> {s.online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular">{s.last30.jobs}</td>
                    <td className="px-3 py-3 text-right font-mono tabular">{rupees(s.last30.revenue)}</td>
                    <td className="px-3 py-3">
                      {s.razorpay?.keyId ? <Badge tone={s.razorpay.keyId.startsWith('rzp_live_') ? 'ok' : 'warn'}>{s.razorpay.keyId.startsWith('rzp_live_') ? 'Live' : 'Test'}</Badge> : <Badge>Not connected</Badge>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={s.active ? 'ok' : 'neutral'}>{s.active ? (s.accepting ? 'Live' : 'Paused by shop') : 'Disabled'}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openShop(s)}>
                        Open <ArrowUpRight className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateShop open={creating} onClose={() => setCreating(false)} onCreated={() => void load()} />
      {editing && <EditShop shop={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </AppShell>
  );
}

function Kpi({ label, value, sub, icon }: { label: string; value: string | null; sub: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between text-ink-mute">
        <p className="text-xs font-semibold sm:text-sm">{label}</p>
        {icon}
      </div>
      {value === null ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-1 font-mono text-2xl font-bold tabular sm:text-[1.75rem]">{value}</p>}
      <p className="text-xs text-ink-mute">{sub}</p>
    </Card>
  );
}

function CreateShop({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const blank = { name: '', area: '', city: '', ownerName: '', ownerPhone: '', ownerPassword: '', bw: '2', color: '10' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; qrUrl: string } | null>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/api/admin/shops', {
        method: 'POST',
        json: {
          name: f.name,
          area: f.area,
          city: f.city,
          ownerName: f.ownerName,
          ownerPhone: f.ownerPhone,
          ownerPassword: f.ownerPassword,
          rates: { bwPerPage: Math.round(parseFloat(f.bw) * 100), colorPerPage: Math.round(parseFloat(f.color) * 100), colorEnabled: true },
        },
      });
      setCreated({ name: r.shop.name, qrUrl: r.qrUrl });
      setF(blank);
      onCreated();
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setCreated(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={created ? 'Shop added' : 'Add a shop'} wide>
      {created ? (
        <div className="text-center">
          <p className="text-lg font-bold">{created.name} is live</p>
          <p className="mt-1 text-sm text-ink-mute">Share the owner login. They connect their own Razorpay under Payments. Their QR link is:</p>
          <code className="mt-4 block rounded-xl bg-paper px-4 py-3 font-mono text-sm">{created.qrUrl}</code>
          <Button className="mt-6 w-full" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Shop name" className="sm:col-span-3">
              <Input value={f.name} onChange={set('name')} required minLength={2} placeholder="Sharma Photostat" />
            </Field>
            <Field label="Area">
              <Input value={f.area} onChange={set('area')} placeholder="Sector 17" />
            </Field>
            <Field label="City">
              <Input value={f.city} onChange={set('city')} placeholder="Chandigarh" />
            </Field>
          </div>
          <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
            <Field label="Owner name">
              <Input value={f.ownerName} onChange={set('ownerName')} required minLength={2} />
            </Field>
            <Field label="Owner mobile" hint="Used to sign in">
              <Input value={f.ownerPhone} onChange={(e) => setF({ ...f, ownerPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} inputMode="numeric" required pattern="\d{10}" />
            </Field>
            <Field label="Password" hint="At least 6 characters">
              <Input value={f.ownerPassword} onChange={set('ownerPassword')} required minLength={6} />
            </Field>
          </div>
          <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <Field label="B/W per page">
              <Input prefix="₹" inputMode="decimal" value={f.bw} onChange={set('bw')} required />
            </Field>
            <Field label="Colour per page">
              <Input prefix="₹" inputMode="decimal" value={f.color} onChange={set('color')} required />
            </Field>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Create shop
          </Button>
        </form>
      )}
    </Modal>
  );
}

function EditShop({ shop, onClose, onSaved }: { shop: AdminShop; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [active, setActive] = useState(shop.active);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api(`/api/admin/shops/${shop.id}`, { method: 'PATCH', json: { active } });
      toast('Shop updated');
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={shop.name}>
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Shop enabled</p>
            <p className="text-xs text-ink-mute">Disabled shops show &ldquo;QR not active&rdquo; to customers.</p>
          </div>
          <Switch checked={active} onChange={setActive} label="Shop enabled" />
        </div>
        <a href={shop.qrUrl} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-ink-mute hover:text-ink">
          {shop.qrUrl}
        </a>
        <Button className="w-full" loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
