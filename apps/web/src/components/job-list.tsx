'use client';

import { AlertTriangle, Eye, MoreHorizontal, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { JobStatus } from '@seedhaprint/shared';
import { Badge, Button, Field, Input, Modal, StatusPill, useToast } from '@/components/ui';
import { api, openAuthed } from '@/lib/api';
import { cx, plural, rupees, timeAgo } from '@/lib/format';

export interface ShopJob {
  id: string;
  ref: string;
  status: JobStatus;
  pickupCode: string;
  file: { name: string; pages: number; bytes?: number; available: boolean };
  mode: 'bw' | 'color';
  copies: number;
  rate: number;
  total: number;
  platformFee: number;
  printer: string;
  error: string;
  paidAt?: string;
  printedAt?: string;
  mockPayment: boolean;
  createdAt: string;
}

export function JobList({ jobs, onChange, compact }: { jobs: ShopJob[]; onChange: (j: ShopJob) => void; compact?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {jobs.map((j) => (
        <JobRow key={j.id} job={j} onChange={onChange} compact={compact} />
      ))}
    </ul>
  );
}

function JobRow({ job, onChange, compact }: { job: ShopJob; onChange: (j: ShopJob) => void; compact?: boolean }) {
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  async function act(path: string, body?: unknown, ok?: string) {
    setBusy(true);
    setMenu(false);
    try {
      const r = await api<{ job: ShopJob }>(`/api/shop/jobs/${job.id}/${path}`, { method: 'POST', json: body ?? {} });
      onChange(r.job);
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast((e as Error).message, 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const canFail = ['queued', 'sent', 'printing', 'printed'].includes(job.status);
  const issue = job.status === 'failed';

  return (
    <li className={cx('flex items-center gap-4 py-3.5', issue && 'relative')}>
      <div className={cx('grid h-12 w-[4.25rem] shrink-0 place-items-center rounded-xl font-mono text-lg font-bold tabular', issue ? 'bg-bad-soft text-bad' : 'bg-paper-2 text-ink')}>
        {job.pickupCode}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{job.file.name}</p>
          {job.mockPayment && <Badge className="shrink-0">Test</Badge>}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-mute">
          <span>
            {plural(job.file.pages, 'page')} × {job.copies}
          </span>
          <span className={cx('inline-flex items-center gap-1 font-semibold', job.mode === 'color' ? 'text-magenta' : 'text-ink-soft')}>
            <span className={cx('size-2 rounded-full', job.mode === 'color' ? 'bg-[conic-gradient(#00a3e0,#e5007d,#ffd200,#00a3e0)]' : 'bg-ink')} />
            {job.mode === 'color' ? 'Colour' : 'B/W'}
          </span>
          {!compact && job.printer && <span className="hidden truncate sm:inline">· {job.printer}</span>}
          <span>· {timeAgo(job.paidAt || job.createdAt)}</span>
        </p>
        {job.error && (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-bad">
            <AlertTriangle className="size-3.5" /> {job.error}
          </p>
        )}
      </div>
      <div className="hidden text-right sm:block">
        <p className="font-mono font-bold tabular">{rupees(job.total)}</p>
        <div className="mt-1">
          <StatusPill status={job.status} />
        </div>
      </div>
      <div className="sm:hidden">
        <StatusPill status={job.status} />
      </div>

      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenu((m) => !m)} disabled={busy} className="grid size-9 place-items-center rounded-lg text-ink-mute hover:bg-paper-2 hover:text-ink" aria-label="Job actions">
          <MoreHorizontal className="size-5" />
        </button>
        {menu && (
          <div className="absolute right-0 top-10 z-20 w-52 animate-rise overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lift">
            <MenuItem
              icon={<Eye className="size-4" />}
              disabled={!job.file.available}
              onClick={() => {
                setMenu(false);
                openAuthed(`/api/shop/jobs/${job.id}/file`).catch((e) => toast(e.message, 'bad'));
              }}
            >
              {job.file.available ? 'View file' : 'File deleted'}
            </MenuItem>
            {issue && (
              <MenuItem icon={<RotateCcw className="size-4" />} onClick={() => act('retry', undefined, 'Sent to the printer again')}>
                Print again
              </MenuItem>
            )}
            {issue && (
              <MenuItem icon={<Undo2 className="size-4" />} onClick={() => confirm(`Refund ${rupees(job.total)} to the customer?`) && act('refund', undefined, 'Refund started')}>
                Refund customer
              </MenuItem>
            )}
            {canFail && (
              <MenuItem
                danger
                icon={<AlertTriangle className="size-4" />}
                onClick={() => {
                  setMenu(false);
                  setFailOpen(true);
                }}
              >
                Report a problem
              </MenuItem>
            )}
          </div>
        )}
      </div>

      <Modal open={failOpen} onClose={() => setFailOpen(false)} title={`Problem with job ${job.pickupCode}`}>
        <p className="text-sm text-ink-mute">The job moves to Issues. From there you can print it again or refund the customer.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Paper jam', 'Out of paper', 'Out of toner/ink', 'Bad print quality', 'Customer left'].map((r) => (
            <button key={r} onClick={() => setReason(r)} className={cx('rounded-full border px-3 py-1.5 text-sm font-semibold transition', reason === r ? 'border-ink bg-ink text-white' : 'border-line-strong hover:border-ink-mute')}>
              {r}
            </button>
          ))}
        </div>
        <Field label="What went wrong?" className="mt-4">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Type a short reason" />
        </Field>
        <Button
          variant="danger"
          className="mt-6 w-full"
          loading={busy}
          disabled={reason.trim().length < 2}
          onClick={async () => (await act('fail', { reason: reason.trim() }, 'Moved to Issues')) && setFailOpen(false)}
        >
          Mark as failed
        </Button>
      </Modal>
    </li>
  );
}

function MenuItem({ icon, children, onClick, danger, disabled }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx('flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold transition disabled:opacity-40', danger ? 'text-bad hover:bg-bad-soft' : 'text-ink hover:bg-paper')}
    >
      {icon}
      {children}
    </button>
  );
}
