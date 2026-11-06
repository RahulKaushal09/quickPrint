'use client';

import { AlertTriangle, Check, CreditCard, FileText, Printer, RotateCcw, Send, Store } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { JobStatus } from '@seedhaprint/shared';
import { Button, Card, Mark, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { cx, plural, rupees } from '@/lib/format';

interface Job {
  ref: string;
  status: JobStatus;
  pickupCode: string;
  file: { name: string; pages: number };
  mode: 'bw' | 'color';
  copies: number;
  rate: number;
  total: number;
  paidAt?: string;
  printedAt?: string;
  events: { at: string; status: JobStatus }[];
  shop?: { name: string; area?: string; code: string };
}

const STEPS = [
  { key: 'paid', label: 'Payment received', icon: CreditCard },
  { key: 'sent', label: 'Sent to the printer', icon: Send },
  { key: 'printing', label: 'Printing', icon: Printer },
  { key: 'printed', label: 'Ready to collect', icon: Store },
] as const;

function stepIndex(s: JobStatus): number {
  switch (s) {
    case 'queued':
      return 0;
    case 'sent':
      return 1;
    case 'printing':
      return 2;
    case 'printed':
      return 3;
    default:
      return -1;
  }
}

const FINAL: JobStatus[] = ['printed', 'refunded', 'expired'];

export function JobTracker({ jobRef }: { jobRef: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const j = await api<Job>(`/api/public/jobs/${jobRef}`);
        if (stop) return;
        setJob(j);
        setError('');
        if (FINAL.includes(j.status)) return;
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      timer = setTimeout(tick, document.hidden ? 8000 : 2000);
    }
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobRef]);

  if (!job) {
    return (
      <Shell>
        {error ? <p className="mt-10 text-center font-semibold">{error}</p> : <><Skeleton className="h-64" /><Skeleton className="mt-4 h-40" /></>}
      </Shell>
    );
  }

  const idx = stepIndex(job.status);
  const done = job.status === 'printed';
  const failed = job.status === 'failed';
  const refunded = job.status === 'refunded';
  const unpaid = job.status === 'draft' || job.status === 'expired';

  return (
    <Shell shop={job.shop}>
      {/* Hero */}
      <Card className="relative animate-rise overflow-hidden text-center">
        <div className="cmyk-bar h-1.5" />
        <div className="px-6 pb-7 pt-8">
          <div
            className={cx(
              'mx-auto grid size-16 place-items-center rounded-full',
              done && 'bg-ok text-white',
              (failed || refunded) && 'bg-warn-soft text-warn',
              !done && !failed && !refunded && 'bg-ink text-white',
            )}
          >
            {done ? <Check className="size-8" strokeWidth={3} /> : failed || refunded ? <AlertTriangle className="size-7" /> : <PrinterAnim />}
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
            {done ? 'Your prints are ready' : failed ? 'Printing hit a problem' : refunded ? 'Payment refunded' : unpaid ? 'Payment not received' : idx === 0 ? 'Waiting for the printer' : 'Printing your document'}
          </h1>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-mute">
            {done
              ? 'Show this code at the counter to collect them.'
              : failed
                ? 'Please show this code at the counter. The shop will reprint it or refund you.'
                : refunded
                  ? `${rupees(job.total)} is on its way back to you. It usually reaches your account in 5 to 7 working days.`
                  : unpaid
                    ? 'This order was not paid, so nothing will be printed.'
                    : 'Keep this page open. It updates by itself.'}
          </p>

          {!unpaid && !refunded && (
            <div className="mx-auto mt-6 inline-flex flex-col items-center rounded-2xl border-2 border-dashed border-line-strong bg-paper px-8 py-4">
              <span className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-ink-mute">Pickup code</span>
              <span className="mt-1 font-mono text-5xl font-bold tracking-[0.12em] tabular">{job.pickupCode}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Progress */}
      {!unpaid && !refunded && (
        <Card className="mt-4 animate-rise p-5 [animation-delay:80ms]">
          <ol className="relative">
            {STEPS.map((s, i) => {
              const reached = idx >= i || done;
              const current = idx === i && !done && !failed;
              const Icon = s.icon;
              return (
                <li key={s.key} className="relative flex gap-3.5 pb-5 last:pb-0">
                  {i < STEPS.length - 1 && <span className={cx('absolute left-[17px] top-9 h-[calc(100%-28px)] w-0.5 rounded', idx > i || done ? 'bg-ok' : 'bg-line')} />}
                  <span
                    className={cx(
                      'relative grid size-9 shrink-0 place-items-center rounded-full transition-colors',
                      reached && !current && 'bg-ok text-white',
                      current && 'bg-ink text-white ring-4 ring-ink/10',
                      !reached && 'bg-paper-2 text-ink-mute',
                    )}
                  >
                    {reached && !current ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4" />}
                  </span>
                  <div className="pt-1.5">
                    <p className={cx('font-semibold', !reached && 'text-ink-mute')}>{s.label}</p>
                    {current && <p className="text-xs text-ink-mute">{i === 0 ? 'Your file is next in line' : 'This takes a few seconds per page'}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* Receipt */}
      <Card className="mt-4 animate-rise p-5 text-sm [animation-delay:140ms]">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-paper-2">
            <FileText className="size-5 text-ink-soft" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{job.file.name}</p>
            <p className="text-ink-mute">
              {plural(job.file.pages, 'page')} × {plural(job.copies, 'copy', 'copies')} · {job.mode === 'color' ? 'Colour' : 'Black & white'}
            </p>
          </div>
          <p className="font-mono text-lg font-bold tabular">{rupees(job.total)}</p>
        </div>
        {job.paidAt && (
          <p className="mt-3 border-t border-line pt-3 text-xs text-ink-mute">
            Paid {new Date(job.paidAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · Ref {job.ref.slice(0, 8).toUpperCase()}
          </p>
        )}
      </Card>

      {job.shop && (
        <Link href={`/s/${job.shop.code}`} className="mt-6 block">
          <Button variant="secondary" size="lg" className="w-full" icon={<RotateCcw className="size-4" />}>
            Print another document
          </Button>
        </Link>
      )}
    </Shell>
  );
}

function Shell({ children, shop }: { children: React.ReactNode; shop?: { name: string; area?: string } }) {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-10 pt-[max(env(safe-area-inset-top),20px)]">
      <div className="mb-5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-ink-mute">
          <Mark size={18} /> SeedhaPrint
        </span>
        {shop && <span className="truncate pl-4 text-xs font-semibold text-ink-soft">{shop.name}</span>}
      </div>
      {children}
    </main>
  );
}

/** A printer with a sheet sliding out. */
function PrinterAnim() {
  return (
    <span className="relative grid size-9 place-items-center">
      <Printer className="relative z-10 size-8" strokeWidth={1.75} />
      <span className="absolute left-1/2 top-[58%] z-0 h-3 w-3.5 -translate-x-1/2 overflow-hidden">
        <span className="block h-full animate-feed bg-cyan" />
      </span>
    </span>
  );
}
