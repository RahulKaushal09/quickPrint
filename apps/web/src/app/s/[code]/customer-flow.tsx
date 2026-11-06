'use client';

import { ArrowRight, Camera, Check, FileText, Lock, MapPin, RefreshCw, ShieldCheck, Trash2, Upload, WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { quote, type ColorMode } from '@quickprint/shared';
import { Button, Card, Dot, Mark, Skeleton, Stepper } from '@/components/ui';
import { api, ApiError, uploadFile } from '@/lib/api';
import { bytes, cx, initials, plural, rupees } from '@/lib/format';
import { MockCheckout } from './mock-checkout';

interface Shop {
  code: string;
  name: string;
  area: string;
  city: string;
  phone: string;
  rates: { bwPerPage: number; colorPerPage: number; colorEnabled: boolean };
  open: boolean;
  online: boolean;
}

interface Draft {
  ref: string;
  file: { name: string; pages: number };
}

interface PublicConfig {
  accept: string[];
  limits: { maxFileBytes: number; maxCopies: number };
  payments: { mode: 'mock' } | { mode: 'razorpay'; keyId: string };
}

interface Order {
  orderId: string;
  amount: number;
  mock: boolean;
  keyId?: string;
  shopName: string;
  description: string;
}

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window. Check your internet.'));
    document.body.appendChild(s);
  });
}

export function CustomerFlow({ code }: { code: string }) {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [loadError, setLoadError] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploadError, setUploadError] = useState('');

  const [mode, setMode] = useState<ColorMode>('bw');
  const [copies, setCopies] = useState(1);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [mockOrder, setMockOrder] = useState<Order | null>(null);

  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const loadShop = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api<Shop>(`/api/public/shops/${code}`), api<PublicConfig>('/api/public/config')]);
      setShop(s);
      setCfg(c);
      setLoadError('');
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [code]);

  useEffect(() => {
    void loadShop();
    // Keep the printer status fresh while the customer is on the page.
    const t = setInterval(() => api<Shop>(`/api/public/shops/${code}`).then(setShop).catch(() => {}), 20_000);
    return () => clearInterval(t);
  }, [code, loadShop]);

  async function choose(f: File | undefined) {
    if (!f || !shop || !cfg) return;
    setUploadError('');
    if (f.size > cfg.limits.maxFileBytes) {
      setUploadError('This file is larger than 25 MB. Please choose a smaller file.');
      return;
    }
    setFile(f);
    setDraft(null);
    setProgress(0);
    setProcessing(false);
    try {
      const d = await uploadFile<Draft>(`/api/public/shops/${shop.code}/uploads`, f, (p) => {
        setProgress(p);
        if (p >= 100) setProcessing(true);
      });
      setDraft(d);
      setCopies(1);
    } catch (e) {
      setFile(null);
      setUploadError((e as Error).message);
    } finally {
      setProcessing(false);
    }
  }

  function reset() {
    setFile(null);
    setDraft(null);
    setUploadError('');
    setPayError('');
    if (pickRef.current) pickRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  }

  const canPay = Boolean(shop?.open && shop.online && draft);
  const q = draft && shop ? quote(shop.rates, mode, draft.file.pages, copies) : null;

  async function pay() {
    if (!draft || !shop || !cfg) return;
    setPaying(true);
    setPayError('');
    try {
      const order = await api<Order>(`/api/public/jobs/${draft.ref}/checkout`, { method: 'POST', json: { mode, copies } });
      if (order.mock) {
        setMockOrder(order);
        setPaying(false);
        return;
      }
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: 'INR',
        name: order.shopName,
        description: order.description,
        theme: { color: '#0b1220' },
        modal: { ondismiss: () => setPaying(false) },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api(`/api/public/jobs/${draft.ref}/verify`, {
              method: 'POST',
              json: { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature },
            });
          } catch {
            // The webhook will still mark it paid; the tracking page shows the real status.
          }
          router.push(`/j/${draft.ref}`);
        },
      });
      rzp.on('payment.failed', () => setPayError('Payment did not go through. No money was taken. Please try again.'));
      rzp.open();
    } catch (e) {
      setPayError((e as Error).message);
      setPaying(false);
    }
  }

  async function confirmMock() {
    if (!draft) return;
    await api(`/api/public/jobs/${draft.ref}/mock-pay`, { method: 'POST' });
    router.push(`/j/${draft.ref}`);
  }

  // ------------------------------------------------------------ render

  if (loadError) {
    return (
      <Shell>
        <Card className="mt-6 p-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-paper-2">
            <Mark size={30} />
          </div>
          <h1 className="text-xl font-bold">{loadError}</h1>
          <p className="mt-2 text-sm text-ink-mute">Please ask the shop for help, or scan the QR code again.</p>
          <Button variant="secondary" className="mt-6" onClick={loadShop} icon={<RefreshCw className="size-4" />}>
            Try again
          </Button>
        </Card>
      </Shell>
    );
  }

  if (!shop || !cfg) {
    return (
      <Shell>
        <Skeleton className="mt-2 h-20" />
        <Skeleton className="mt-5 h-56" />
      </Shell>
    );
  }

  const unavailable = !shop.open ? 'closed' : !shop.online ? 'offline' : null;
  const accept = cfg.accept.join(',') + ',image/*';

  return (
    <Shell>
      {/* Shop header */}
      <header className="flex animate-rise items-center gap-3.5">
        <div className="grid size-13 shrink-0 place-items-center rounded-2xl bg-ink text-lg font-bold text-white shadow-lift">{initials(shop.name)}</div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.2rem] font-extrabold leading-tight tracking-tight">{shop.name}</h1>
          {(shop.area || shop.city) && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-mute">
              <MapPin className="size-3.5 shrink-0" />
              {[shop.area, shop.city].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        <span className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', unavailable ? 'bg-paper-2 text-ink-mute' : 'bg-ok-soft text-ok')}>
          <Dot on={!unavailable} pulse />
          {unavailable ? 'Offline' : 'Ready'}
        </span>
      </header>

      {unavailable && (
        <Card className="mt-5 flex animate-rise gap-3 border-warn/20 bg-warn-soft p-4">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-warn" />
          <div className="text-sm">
            <p className="font-bold text-warn">{unavailable === 'closed' ? 'Not taking orders right now' : "The shop's printer is offline"}</p>
            <p className="mt-0.5 text-ink-soft">You can still upload and check the price. Payment opens as soon as the printer is back. Please ask at the counter.</p>
          </div>
        </Card>
      )}

      {/* Step 1: file */}
      <section className="mt-6 animate-rise [animation-delay:60ms]">
        <StepTitle n={1} done={Boolean(draft)}>
          Your document
        </StepTitle>

        {!file ? (
          <>
            <button
              onClick={() => pickRef.current?.click()}
              className="group relative mt-3 flex w-full flex-col items-center overflow-hidden rounded-3xl border-2 border-dashed border-line-strong bg-surface px-6 py-10 text-center transition hover:border-ink-mute active:scale-[0.99]"
            >
              <div className="paper-grid absolute inset-0 opacity-60" />
              <div className="relative grid size-16 place-items-center rounded-2xl bg-ink text-white shadow-lift transition group-hover:-translate-y-0.5">
                <Upload className="size-7" />
              </div>
              <p className="relative mt-4 text-lg font-bold">Tap to choose a file</p>
              <p className="relative mt-1 text-sm text-ink-mute">PDF or photo · up to 25 MB</p>
            </button>
            <button
              onClick={() => cameraRef.current?.click()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-3.5 text-sm font-semibold text-ink-soft transition hover:text-ink sm:hidden"
            >
              <Camera className="size-4.5" /> Take a photo of a document
            </button>
          </>
        ) : (
          <FileCard file={file} draft={draft} progress={progress} processing={processing} onRemove={reset} />
        )}

        {uploadError && <p className="mt-3 rounded-xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{uploadError}</p>}
        <input ref={pickRef} type="file" accept={accept} className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
      </section>

      {/* Step 2: options */}
      <section className={cx('mt-8 transition-opacity duration-300', !draft && 'pointer-events-none opacity-40')} aria-disabled={!draft}>
        <StepTitle n={2} done={false}>
          Print options
        </StepTitle>

        <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Colour">
          <ModeCard active={mode === 'bw'} onClick={() => setMode('bw')} title="Black & white" price={shop.rates.bwPerPage} swatch="bw" />
          <ModeCard
            active={mode === 'color'}
            onClick={() => shop.rates.colorEnabled && setMode('color')}
            title="Colour"
            price={shop.rates.colorPerPage}
            swatch="color"
            disabled={!shop.rates.colorEnabled}
          />
        </div>

        <Card className="mt-3 flex items-center justify-between p-4 pl-5">
          <div>
            <p className="font-bold">Copies</p>
            <p className="text-sm text-ink-mute">{draft ? `Each copy is ${plural(draft.file.pages, 'page')}` : 'How many sets'}</p>
          </div>
          <Stepper value={copies} onChange={setCopies} max={cfg.limits.maxCopies} />
        </Card>

        <p className="mt-3 flex items-center gap-1.5 px-1 text-xs text-ink-mute">
          <FileText className="size-3.5" /> A4 paper, single-sided. Pages are scaled to fit.
        </p>
      </section>

      {/* Summary */}
      {q && (
        <Card className="mt-6 animate-rise overflow-hidden">
          <div className="cmyk-bar h-1" />
          <div className="space-y-2.5 p-5 text-sm">
            <Row label={`${plural(q.pages, 'page')} × ${plural(q.copies, 'copy', 'copies')}`} value={plural(q.sheets, 'print')} />
            <Row label={mode === 'color' ? 'Colour rate' : 'Black & white rate'} value={`${rupees(q.rate)} / page`} />
            <div className="flex items-baseline justify-between border-t border-dashed border-line-strong pt-3">
              <span className="font-bold">Total</span>
              <span className="font-mono text-2xl font-bold tabular">{rupees(q.total)}</span>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-center gap-4 text-xs text-ink-mute">
        <span className="flex items-center gap-1">
          <Lock className="size-3.5" /> Secure UPI &amp; card payment
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="size-3.5" /> File deleted after printing
        </span>
      </div>

      {/* Sticky pay bar */}
      <div className="h-36" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-xl">
        <div className="mx-auto max-w-lg px-5 pt-3">
          {payError && <p className="mb-2 text-center text-sm font-medium text-bad">{payError}</p>}
          <Button size="xl" className="w-full" disabled={!canPay || !q} loading={paying} onClick={pay}>
            {!draft ? (
              'Choose a file to continue'
            ) : unavailable ? (
              'Printer offline, payment paused'
            ) : (
              <>
                Pay {q ? rupees(q.total) : ''} &amp; print <ArrowRight className="size-5" />
              </>
            )}
          </Button>
        </div>
      </div>

      {mockOrder && <MockCheckout order={mockOrder} onPaid={confirmMock} onClose={() => setMockOrder(null)} />}
    </Shell>
  );
}

// ---------------------------------------------------------------- pieces

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-6 pt-[max(env(safe-area-inset-top),20px)]">
      <div className="mb-5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-ink-mute">
          <Mark size={18} /> QuickPrint
        </span>
        <span className="text-xs text-ink-mute">Scan · Upload · Collect</span>
      </div>
      {children}
    </main>
  );
}

function StepTitle({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-[0.95rem] font-bold">
      <span className={cx('grid size-6 place-items-center rounded-full text-xs font-bold', done ? 'bg-ok text-white' : 'bg-ink text-white')}>
        {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
      </span>
      {children}
    </h2>
  );
}

function FileCard({ file, draft, progress, processing, onRemove }: { file: File; draft: Draft | null; progress: number; processing: boolean; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/');
  const [thumb, setThumb] = useState<string>();
  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(file);
    setThumb(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImage]);

  return (
    <Card className="mt-3 flex animate-rise items-center gap-4 p-4">
      <div className="relative grid h-[4.5rem] w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-paper shadow-card">
        {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <FileText className="size-6 text-ink-soft" />}
        {!draft && (
          <div className="absolute inset-0 overflow-hidden bg-white/40">
            <div className="h-full animate-feed bg-gradient-to-b from-transparent via-cyan/20 to-transparent" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{file.name}</p>
        {draft ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ok">
            <Check className="size-4" strokeWidth={2.5} /> {plural(draft.file.pages, 'page')} · {bytes(file.size)}
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-sm text-ink-mute">{processing ? 'Counting pages…' : `Uploading ${progress}%`}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-2">
              <div className={cx('h-full rounded-full bg-ink transition-all duration-300', processing && 'animate-pulse')} style={{ width: `${processing ? 100 : progress}%` }} />
            </div>
          </>
        )}
      </div>
      {draft && (
        <button onClick={onRemove} className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-mute transition hover:bg-bad-soft hover:text-bad" aria-label="Remove file">
          <Trash2 className="size-4.5" />
        </button>
      )}
    </Card>
  );
}

function ModeCard({ active, onClick, title, price, swatch, disabled }: { active: boolean; onClick: () => void; title: string; price: number; swatch: 'bw' | 'color'; disabled?: boolean }) {
  return (
    <button
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'relative rounded-2xl border-2 bg-surface p-4 text-left transition active:scale-[0.98] disabled:opacity-40',
        active ? 'border-ink shadow-lift' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {(swatch === 'bw' ? ['#0b1220', '#7c8394', '#d5d1c5'] : ['#00a3e0', '#e5007d', '#ffd200']).map((c) => (
            <span key={c} className="size-5 rounded-full ring-2 ring-white" style={{ background: c }} />
          ))}
        </div>
        <span className={cx('grid size-5 place-items-center rounded-full border-2 transition', active ? 'border-ink bg-ink' : 'border-line-strong')}>
          {active && <span className="size-1.5 rounded-full bg-white" />}
        </span>
      </div>
      <p className="mt-3.5 font-bold leading-tight">{title}</p>
      <p className="mt-0.5 text-sm text-ink-mute">{disabled ? 'Not available' : <><span className="font-mono font-semibold text-ink">{rupees(price)}</span> / page</>}</p>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-mute">{label}</span>
      <span className="font-semibold tabular">{value}</span>
    </div>
  );
}
