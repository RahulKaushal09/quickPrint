'use client';

import { ArrowUpRight, CalendarCheck, IndianRupee, Plus, QrCode, Search, Store, Wifi } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { Badge, Button, Card, Dot, Empty, Field, Input, Modal, Select, Skeleton, Switch, useToast } from '@/components/ui';
import { api, session } from '@/lib/api';
import { cx, rupees } from '@/lib/format';
import { METHOD_LABEL, PLAN_LABEL, PLAN_TONE, planDate, planDateInput, type Plan, type PlanPayment, type PlanState } from '@/lib/plan';

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
  plan: Plan;
  subscription?: { fee: number; paidUntil?: string; payments?: PlanPayment[] };
}

interface Stats {
  shops: number;
  active: number;
  online: number;
  last30: { jobs: number; revenue: number; pages: number };
  subscriptions: { thisMonth: number; states: Record<PlanState, number> };
}

const FILTERS: { key: 'all' | PlanState; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Paid' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'grace', label: 'Overdue' },
  { key: 'off', label: 'Switched off' },
  { key: 'free', label: 'Free' },
];

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; phone: string } | null>(null);
  const [shops, setShops] = useState<AdminShop[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | PlanState>('all');
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
    if (!shops) return shops;
    return shops.filter(
      (x) =>
        (filter === 'all' || x.plan?.state === filter) &&
        (!s || [x.name, x.code, x.city, x.area, x.owner?.phone, x.owner?.name].some((v) => v?.toLowerCase().includes(s))),
    );
  }, [shops, q, filter]);

  // Keep the open shop in step with fresh data after a payment or an edit.
  const editingNow = editing && shops ? (shops.find((x) => x.id === editing.id) ?? editing) : editing;

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
        <Kpi
          label="Subscriptions this month"
          value={stats ? rupees(stats.subscriptions.thisMonth) : null}
          sub={stats ? `${stats.subscriptions.states.due_soon + stats.subscriptions.states.grace} due, ${stats.subscriptions.states.off} switched off` : ''}
          icon={<IndianRupee className="size-4" />}
        />
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-paper-2 p-1 sm:inline-flex">
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? stats?.shops : stats?.subscriptions.states[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cx('whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition', filter === f.key ? 'bg-surface text-ink shadow-card' : 'text-ink-mute hover:text-ink')}
            >
              {f.label}
              {count !== undefined && <span className="ml-1.5 font-mono text-xs text-ink-mute">{count}</span>}
            </button>
          );
        })}
      </div>

      <Card className="mt-4 overflow-hidden">
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
                  <th className="px-3 py-3">Plan</th>
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
                      <button onClick={() => setEditing(s)} className="text-left">
                        <Badge tone={PLAN_TONE[s.plan.state]}>{PLAN_LABEL[s.plan.state]}</Badge>
                        <p className="mt-1 text-xs text-ink-mute">{s.plan.state === 'free' ? 'No fee' : s.plan.paidUntil ? `till ${planDate(s.plan.paidUntil)}` : 'Never paid'}</p>
                      </button>
                    </td>
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
      {editingNow && <EditShop shop={editingNow} onClose={() => setEditing(null)} onSaved={() => load()} />}
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
  const blank = { name: '', area: '', city: '', ownerName: '', ownerPhone: '', ownerPassword: '', bw: '2', color: '10', fee: '0', trialDays: '14' };
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
          fee: Math.round(parseFloat(f.fee || '0') * 100),
          trialDays: parseInt(f.trialDays || '0', 10),
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
          <p className="mt-1 text-sm text-ink-mute">Share the owner login. Under Payments they connect their own Razorpay and add this website to their Razorpay account, or online payments are blocked. Their QR link is:</p>
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
          <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <Field label="Monthly fee" hint="0 keeps the shop free">
              <Input prefix="₹" inputMode="decimal" value={f.fee} onChange={set('fee')} required />
            </Field>
            <Field label="Free days before the first payment">
              <Input inputMode="numeric" value={f.trialDays} onChange={(e) => setF({ ...f, trialDays: e.target.value.replace(/\D/g, '').slice(0, 3) })} disabled={!parseFloat(f.fee)} />
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

function EditShop({ shop, onClose, onSaved }: { shop: AdminShop; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [active, setActive] = useState(shop.active);
  const [fee, setFee] = useState(String((shop.subscription?.fee ?? 0) / 100));
  const [paidUntil, setPaidUntil] = useState(planDateInput(shop.subscription?.paidUntil));
  const [busy, setBusy] = useState(false);
  const feePaise = Math.round(parseFloat(fee || '0') * 100);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PlanPayment['method']>('upi');
  const [note, setNote] = useState('');
  const payments = [...(shop.subscription?.payments ?? [])].reverse();

  async function save() {
    setBusy(true);
    try {
      await api(`/api/admin/shops/${shop.id}`, { method: 'PATCH', json: { active } });
      await api(`/api/admin/shops/${shop.id}/subscription`, { method: 'PATCH', json: { fee: feePaise, paidUntil: paidUntil || null } });
      toast('Shop updated');
      await onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function markPaid() {
    setBusy(true);
    try {
      const r = await api(`/api/admin/shops/${shop.id}/subscription/payments`, {
        method: 'POST',
        json: { months, amount: amount === '' ? feePaise * months : Math.round(parseFloat(amount) * 100), method, note },
      });
      setPaidUntil(planDateInput(r.plan.paidUntil));
      setAmount('');
      setNote('');
      toast(`Paid until ${planDate(r.plan.paidUntil)}`);
      await onSaved();
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={shop.name} wide>
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Shop enabled</p>
            <p className="text-xs text-ink-mute">Disabled shops show &ldquo;QR not active&rdquo; to customers.</p>
          </div>
          <Switch checked={active} onChange={setActive} label="Shop enabled" />
        </div>

        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">Subscription</p>
            <Badge tone={PLAN_TONE[shop.plan.state]}>{PLAN_LABEL[shop.plan.state]}</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-mute">
            {shop.plan.state === 'off'
              ? 'Customers can’t order until a payment is recorded.'
              : shop.plan.state === 'grace'
                ? `Ended ${planDate(shop.plan.paidUntil)}. Switches off after ${planDate(shop.plan.graceUntil)}.`
                : shop.plan.state === 'free'
                  ? 'No monthly fee, never switches off.'
                  : `Paid until ${planDate(shop.plan.paidUntil)}.`}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Monthly fee" hint="0 makes the shop free">
              <Input prefix="₹" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </Field>
            <Field label="Paid until" hint="Change it by hand only to correct a mistake">
              <Input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
            </Field>
          </div>

          {feePaise > 0 && (
            <div className="mt-4 rounded-xl bg-paper p-4">
              <p className="flex items-center gap-2 text-sm font-bold">
                <CalendarCheck className="size-4" /> Record a payment
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <Field label="Months">
                  <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                    {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
                <Field label="Amount">
                  <Input prefix="₹" inputMode="decimal" value={amount} placeholder={String((feePaise * months) / 100)} onChange={(e) => setAmount(e.target.value)} />
                </Field>
                <Field label="Paid by">
                  <Select value={method} onChange={(e) => setMethod(e.target.value as PlanPayment['method'])}>
                    {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Note">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="UTR or reference" maxLength={200} />
                </Field>
              </div>
              <p className="mt-2 text-xs text-ink-mute">Adds the months after the current end date, or from today if it has already ended. Switches the shop back on at once.</p>
              <Button className="mt-3" loading={busy} onClick={markPaid}>
                Mark paid
              </Button>
            </div>
          )}

          {payments.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold">Payments</p>
              <ul className="mt-2 divide-y divide-line text-sm">
                {payments.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-mono font-semibold">{rupees(p.amount)}</span>
                      <span className="text-ink-mute">
                        {' '}
                        · {p.months} month{p.months === 1 ? '' : 's'} · {METHOD_LABEL[p.method]}
                        {p.note ? ` · ${p.note}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-mute">{planDate(p.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
