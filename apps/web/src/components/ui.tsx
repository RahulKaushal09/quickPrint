'use client';

import { Loader2, Minus, Plus, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { STATUS_LABEL, type JobStatus } from '@seedhaprint/shared';
import { cx } from '@/lib/format';

// ---------------------------------------------------------------- brand

/** Three process-colour discs overprinting into ink: the SeedhaPrint mark. */
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    // isolation keeps the overprint between the three discs, so the mark looks the same on paper and on ink.
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ isolation: 'isolate' }} aria-hidden>
      <circle cx="12" cy="12.5" r="8.5" fill="#00a3e0" />
      <circle cx="20" cy="12.5" r="8.5" fill="#e5007d" style={{ mixBlendMode: 'multiply' }} />
      <circle cx="16" cy="19.5" r="8.5" fill="#ffd200" style={{ mixBlendMode: 'multiply' }} />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-extrabold tracking-tight', light ? 'text-white' : 'text-ink', className)}>
      <Mark size={26} />
      <span className="text-[1.05rem]">
        Seedha<span className={light ? 'text-white/70' : 'text-ink-soft'}>Print</span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- primitives

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'light';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  icon?: React.ReactNode;
};

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' && 'h-9 px-3.5 text-sm',
        size === 'md' && 'h-11 px-5 text-[0.94rem]',
        size === 'lg' && 'h-13 px-6 text-base',
        size === 'xl' && 'h-15 rounded-2xl px-7 text-[1.06rem]',
        variant === 'primary' && 'bg-ink text-white shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_6px_16px_-6px_rgb(11_18_32/0.5)] hover:bg-ink-2',
        variant === 'secondary' && 'border border-line-strong bg-surface text-ink hover:border-ink-mute hover:bg-paper',
        variant === 'ghost' && 'text-ink-soft hover:bg-paper-2 hover:text-ink',
        variant === 'danger' && 'bg-bad text-white hover:brightness-95',
        variant === 'light' && 'bg-white text-ink hover:bg-white/90',
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-2xl border border-line bg-surface shadow-card', className)}>
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-ink-mute', className)} />;
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'cyan' | 'magenta' | 'ink'; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tone === 'neutral' && 'bg-paper-2 text-ink-soft',
        tone === 'ok' && 'bg-ok-soft text-ok',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'bad' && 'bg-bad-soft text-bad',
        tone === 'cyan' && 'bg-cyan-soft text-[#00739e]',
        tone === 'magenta' && 'bg-magenta-soft text-magenta',
        tone === 'ink' && 'bg-ink text-white',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ on, pulse }: { on: boolean; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2">
      {on && pulse && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />}
      <span className={cx('relative inline-flex size-2 rounded-full', on ? 'bg-ok' : 'bg-ink-mute/50')} />
    </span>
  );
}

const STATUS_TONE: Record<JobStatus, Parameters<typeof Badge>[0]['tone']> = {
  draft: 'neutral',
  queued: 'warn',
  sent: 'cyan',
  printing: 'cyan',
  printed: 'ok',
  failed: 'bad',
  refunded: 'magenta',
  expired: 'neutral',
};

export function StatusPill({ status }: { status: JobStatus }) {
  const live = status === 'queued' || status === 'sent' || status === 'printing';
  return (
    <Badge tone={STATUS_TONE[status]}>
      {live && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs font-medium text-bad">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-ink-mute">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[0.95rem] text-ink placeholder:text-ink-mute/70 transition focus:border-ink focus:outline-none focus:ring-4 focus:ring-ink/8';

export function Input({ className, prefix, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string }) {
  if (prefix) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-mute">{prefix}</span>
        <input {...rest} className={cx(inputClass, 'pl-8', className)} />
      </div>
    );
  }
  return <input {...rest} className={cx(inputClass, className)} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(inputClass, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%237c8394%27 stroke-width=%272%27%3E%3Cpath d=%27m4 6 4 4 4-4%27/%3E%3C/svg%3E")] bg-[right_0.9rem_center] bg-no-repeat pr-10', className)}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50', checked ? 'bg-ok' : 'bg-line-strong')}
    >
      <span className={cx('inline-block size-5.5 rounded-full bg-white shadow transition', checked ? 'translate-x-5.5' : 'translate-x-1')} />
    </button>
  );
}

export function Stepper({ value, onChange, min = 1, max = 50 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const btn = 'grid size-12 place-items-center rounded-xl text-ink transition hover:bg-paper-2 active:scale-95 disabled:opacity-30';
  return (
    <div className="inline-flex items-center rounded-2xl border border-line-strong bg-surface p-1">
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="One less copy">
        <Minus className="size-5" />
      </button>
      <span className="w-12 text-center font-mono text-xl font-semibold tabular" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="One more copy">
        <Plus className="size-5" />
      </button>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 animate-fade bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('relative max-h-[92dvh] w-full animate-sheet overflow-y-auto rounded-t-3xl bg-surface shadow-lift sm:animate-rise sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-ink-mute hover:bg-paper-2 hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-paper-2 text-ink-soft">{icon}</div>
      <p className="font-bold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-mute">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-paper-2', className)} />;
}

// ---------------------------------------------------------------- toasts

type Toast = { id: number; text: string; tone: 'ok' | 'bad' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const id = useRef(0);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const t = { id: ++id.current, text, tone };
    setItems((x) => [...x, t]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map((t) => (
          <div key={t.id} className={cx('animate-rise rounded-xl px-4 py-3 text-sm font-semibold shadow-lift', t.tone === 'ok' ? 'bg-ink text-white' : 'bg-bad text-white')}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
