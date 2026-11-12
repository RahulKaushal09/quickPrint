'use client';

import { ArrowRight, Banknote, Check, CreditCard, Download, FileStack, IndianRupee, Inbox, MonitorSmartphone, Printer, QrCode, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { JobList, type ShopJob } from '@/components/job-list';
import { Badge, Card, Dot, Empty, Skeleton, Switch, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { cx, rupees, timeAgo } from '@/lib/format';
import { useShop } from './shop-context';

interface Overview {
  today: { jobs: number; pages: number; revenue: number; failed: number };
  open: number;
  cashWaiting: number;
  devices: { id: string; name: string; online: boolean; lastSeenAt?: string; printers: { name: string; status: string }[] }[];
}

function greeting() {
  const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const { shop, user, setShop, subscription } = useShop();
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [jobs, setJobs] = useState<ShopJob[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [o, j] = await Promise.all([api<Overview>('/api/shop/overview'), api<{ jobs: ShopJob[] }>('/api/shop/jobs?status=all&limit=8')]);
    setData(o);
    setJobs(j.jobs);
  }, []);

  useEffect(() => {
    void load().catch(() => {});
    const t = setInterval(() => !document.hidden && load().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [load]);

  async function setCashAuto(autoPrint: boolean) {
    setSaving(true);
    try {
      const r = await api('/api/shop', { method: 'PATCH', json: { cash: { ...shop.cash, autoPrint } } });
      setShop(r.shop);
      toast(autoPrint ? 'Cash orders will print straight away' : 'Cash orders will wait for you to accept the money');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccepting(v: boolean) {
    setSaving(true);
    try {
      const r = await api('/api/shop', { method: 'PATCH', json: { accepting: v } });
      setShop(r.shop);
      toast(v ? 'Customers can order again' : 'Orders paused. Customers will see you as closed.');
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setSaving(false);
    }
  }

  const online = data?.devices.some((d) => d.online) ?? false;
  const hasPrinter = data?.devices.some((d) => d.online && d.printers.length) ?? false;
  const setupSteps = [
    { done: (data?.devices.length ?? 0) > 0, label: 'Install the app on your shop PC', href: '/dashboard/printers', icon: Download },
    { done: hasPrinter, label: 'Connect it and check your printers', href: '/dashboard/printers', icon: Printer },
    { done: shop.printers.bw.length > 0 || shop.printers.color.length > 0, label: 'Choose which printers do B/W and colour', href: '/dashboard/printers', icon: MonitorSmartphone },
    { done: Boolean(shop.razorpay?.keyId), label: 'Connect your Razorpay account', href: '/dashboard/payments', icon: CreditCard },
    { done: (data?.today.jobs ?? 0) > 0 || (jobs?.length ?? 0) > 0, label: 'Put up your QR poster', href: '/dashboard/qr', icon: QrCode },
  ];
  const setupLeft = setupSteps.filter((s) => !s.done).length;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        description={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <Card className="flex items-center gap-3 px-4 py-2.5">
            <div className="text-right">
              <p className="text-sm font-bold">{shop.accepting ? 'Taking orders' : 'Orders paused'}</p>
              <p className="text-xs text-ink-mute">{subscription.state === 'off' ? 'Plan ended: QR is unavailable' : shop.accepting ? 'Customers can scan & pay' : 'QR shows shop as closed'}</p>
            </div>
            <Switch checked={shop.accepting} onChange={toggleAccepting} disabled={saving} label="Taking orders" />
          </Card>
        }
      />

      {shop.cash.enabled && (
        <Card className="mb-4 flex items-center gap-4 p-4 sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ok-soft text-ok">
            <Banknote className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">Print cash orders directly</p>
            <p className="text-sm text-ink-mute">{shop.cash.autoPrint ? 'On: cash orders print at once, before you collect the money.' : 'Off: cash orders wait until you tap Cash received.'}</p>
          </div>
          <Switch checked={shop.cash.autoPrint} onChange={setCashAuto} disabled={saving} label="Print cash orders directly" />
        </Card>
      )}

      {Boolean(data?.cashWaiting) && (
        <Link href="/dashboard/jobs" className="mb-4 flex items-center justify-between rounded-2xl bg-yellow px-5 py-3.5 font-bold text-ink">
          {data!.cashWaiting} cash order{data!.cashWaiting === 1 ? '' : 's'} waiting for you
          <ArrowRight className="size-5" />
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Today's earnings" value={data ? rupees(data.today.revenue) : null} icon={<IndianRupee className="size-4" />} accent="ok" hint="Before Razorpay charges" />
        <Stat label="Jobs today" value={data ? String(data.today.jobs) : null} icon={<Inbox className="size-4" />} accent="cyan" hint={data?.open ? `${data.open} printing` : 'All caught up'} />
        <Stat label="Pages printed" value={data ? data.today.pages.toLocaleString('en-IN') : null} icon={<FileStack className="size-4" />} accent="magenta" hint="Today, all printers" />
        <Stat label="Issues" value={data ? String(data.today.failed) : null} icon={<TriangleAlert className="size-4" />} accent={data?.today.failed ? 'bad' : 'yellow'} hint={data?.today.failed ? 'Needs attention' : 'No problems'} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Recent jobs */}
        <Card className="p-5 sm:p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">Latest jobs</h2>
            <Link href="/dashboard/jobs" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
              All jobs <ArrowRight className="size-4" />
            </Link>
          </div>
          {!jobs ? (
            <div className="space-y-3 pt-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : jobs.length ? (
            <JobList compact jobs={jobs} onChange={(j) => setJobs((all) => all!.map((x) => (x.id === j.id ? j : x)))} />
          ) : (
            <Empty icon={<Inbox className="size-6" />} title="No jobs yet">
              When a customer scans your QR and pays, the job shows up here and prints by itself.
            </Empty>
          )}
        </Card>

        <div className="space-y-6">
          {/* PC status */}
          <Card className="overflow-hidden">
            <div className={cx('px-5 py-4', online ? 'bg-ok-soft' : 'bg-paper-2')}>
              <div className="flex items-center gap-2.5">
                <Dot on={online} pulse />
                <p className="font-bold">{online ? 'Printing is live' : data?.devices.length ? 'Shop PC offline' : 'No shop PC yet'}</p>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {online ? 'Paid jobs print automatically.' : data?.devices.length ? 'Jobs wait in the queue until the PC is back.' : 'Connect a PC to start printing.'}
              </p>
            </div>
            <div className="divide-y divide-line">
              {data?.devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{d.name}</p>
                    <p className="text-xs text-ink-mute">{d.online ? `${d.printers.length} printer${d.printers.length === 1 ? '' : 's'}` : `Last seen ${timeAgo(d.lastSeenAt)}`}</p>
                  </div>
                  <Badge tone={d.online ? 'ok' : 'neutral'}>{d.online ? 'Online' : 'Offline'}</Badge>
                </div>
              ))}
              <Link href="/dashboard/printers" className="flex items-center justify-between px-5 py-3 text-sm font-semibold text-ink-soft hover:bg-paper hover:text-ink">
                Manage printers <ArrowRight className="size-4" />
              </Link>
            </div>
          </Card>

          {/* Setup checklist */}
          {data && setupLeft > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold">Get set up</h3>
                <span className="text-xs font-semibold text-ink-mute">
                  {setupSteps.length - setupLeft} of {setupSteps.length}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${((setupSteps.length - setupLeft) / setupSteps.length) * 100}%` }} />
              </div>
              <ul className="mt-4 space-y-1">
                {setupSteps.map((s) => (
                  <li key={s.label}>
                    <Link href={s.href} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-paper">
                      <span className={cx('grid size-6 shrink-0 place-items-center rounded-full', s.done ? 'bg-ok text-white' : 'border-2 border-line-strong')}>
                        {s.done && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span className={cx('font-medium', s.done && 'text-ink-mute line-through')}>{s.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint, icon, accent }: { label: string; value: string | null; hint?: string | null; icon: React.ReactNode; accent: 'ok' | 'cyan' | 'magenta' | 'yellow' | 'bad' }) {
  return (
    <Card className="relative overflow-hidden p-4 sm:p-5">
      <div
        className={cx(
          'mb-3 grid size-8 place-items-center rounded-lg',
          accent === 'ok' && 'bg-ok-soft text-ok',
          accent === 'cyan' && 'bg-cyan-soft text-[#00739e]',
          accent === 'magenta' && 'bg-magenta-soft text-magenta',
          accent === 'yellow' && 'bg-yellow-soft text-warn',
          accent === 'bad' && 'bg-bad-soft text-bad',
        )}
      >
        {icon}
      </div>
      <p className="text-xs font-semibold text-ink-mute sm:text-sm">{label}</p>
      {value === null ? <Skeleton className="mt-1.5 h-8 w-20" /> : <p className="mt-0.5 font-mono text-2xl font-bold tracking-tight tabular sm:text-[1.75rem]">{value}</p>}
      {hint && <p className="mt-0.5 truncate text-xs text-ink-mute">{hint}</p>}
    </Card>
  );
}
