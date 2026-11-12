'use client';

import { ArrowRight, Banknote, Camera, CreditCard, ImagePlus, RefreshCw, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PHOTO_PAPERS, PHOTO_SIZES, photoLayout, photosPerSheet, type PaymentMethod, type PhotoPaper, type PhotoSize } from '@seedhaprint/shared';
import { Button, Card, Stepper } from '@/components/ui';
import { API_URL, uploadFile } from '@/lib/api';
import { cx, plural, rupees } from '@/lib/format';

export interface PhotoSettings {
  size: PhotoSize;
  paper: PhotoPaper;
  perSheet: number;
  price: number;
  available: boolean;
}

type Turn = 0 | 90 | 180 | 270;

interface Props {
  shopCode: string;
  photos: PhotoSettings;
  canTakeOrders: boolean;
  online: boolean;
  cash: boolean;
  maxCopies: number;
  checkout: (ref: string, body: Record<string, unknown>) => Promise<void>;
  paying: boolean;
  payError: string;
  OptionCard: React.ComponentType<{ active: boolean; onClick: () => void; title: string; hint: string; icon?: React.ReactNode }>;
}

/**
 * Passport photos: take or choose one picture, fit the face in the frame,
 * see the whole sheet exactly as it will print, pay, and it prints.
 */
export function PhotoMaker({ shopCode, photos, canTakeOrders, online, cash, maxCopies, checkout, paying, payError, OptionCard }: Props) {
  const size = PHOTO_SIZES[photos.size];
  const perSheet = Math.min(photos.perSheet, photosPerSheet(photos.paper, photos.size));
  const [ref, setRef] = useState<string | null>(null);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [turn, setTurn] = useState<Turn>(0);
  const [picture, setPicture] = useState<HTMLCanvasElement | null>(null); // the source turned upright
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // image corner inside the frame, in frame pixels
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const [copies, setCopies] = useState(1);
  const [method, setMethod] = useState<PaymentMethod>(online ? 'online' : 'cash');
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError('');
    setUploading(1);
    try {
      const job = await uploadFile<{ ref: string }>(`/api/public/shops/${shopCode}/photo`, file, (p) => setUploading(Math.max(1, p)));
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `${API_URL}/api/public/jobs/${job.ref}/photo`;
      await img.decode();
      setRef(job.ref);
      setTurn(0);
      setSource(img);
    } catch (e) {
      setError((e as Error).message || 'That photo could not be opened. Please try another.');
    } finally {
      setUploading(0);
      if (pick.current) pick.current.value = '';
      if (camera.current) camera.current.value = '';
    }
  }

  // The picture turned upright, drawn once per turn.
  useEffect(() => {
    if (!source) return;
    const swap = turn % 180 !== 0;
    const c = document.createElement('canvas');
    c.width = swap ? source.naturalHeight : source.naturalWidth;
    c.height = swap ? source.naturalWidth : source.naturalHeight;
    const g = c.getContext('2d')!;
    g.translate(c.width / 2, c.height / 2);
    g.rotate((turn * Math.PI) / 180);
    g.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
    setPicture(c);
    setZoom(1);
  }, [source, turn]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [picture]);

  const scale = picture && frame.w ? Math.max(frame.w / picture.width, frame.h / picture.height) * zoom : 1;
  const clamp = useCallback(
    (x: number, y: number) =>
      picture ? { x: Math.min(0, Math.max(frame.w - picture.width * scale, x)), y: Math.min(0, Math.max(frame.h - picture.height * scale, y)) } : { x, y },
    [picture, frame, scale],
  );

  // Start centred, a little above middle, where a face usually is.
  useEffect(() => {
    if (picture && frame.w) setOffset(clamp((frame.w - picture.width * scale) / 2, (frame.h - picture.height * scale) * 0.4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picture, frame.w]);
  useEffect(() => setOffset((o) => clamp(o.x, o.y)), [clamp]);

  const crop = picture
    ? { x: -offset.x / (picture.width * scale), y: -offset.y / (picture.height * scale), w: frame.w / (picture.width * scale), h: frame.h / (picture.height * scale) }
    : null;

  // The whole sheet, drawn with the same layout the print file uses.
  useEffect(() => {
    const c = sheet.current;
    if (!c || !picture || !crop) return;
    const layout = photoLayout(photos.paper, photos.size, perSheet);
    const px = 3.2; // canvas pixels per millimetre
    c.width = Math.round(layout.page.w * px);
    c.height = Math.round(layout.page.h * px);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    const sx = crop.x * picture.width;
    const sy = crop.y * picture.height;
    const sw = crop.w * picture.width;
    const sh = crop.h * picture.height;
    for (const s of layout.slots) {
      g.save();
      g.translate(s.x * px, s.y * px);
      if (s.turned) {
        g.translate(s.w * px, 0);
        g.rotate(Math.PI / 2);
        g.drawImage(picture, sx, sy, sw, sh, 0, 0, s.h * px, s.w * px);
      } else {
        g.drawImage(picture, sx, sy, sw, sh, 0, 0, s.w * px, s.h * px);
      }
      g.restore();
      g.strokeStyle = '#d1d1d1';
      g.lineWidth = 1;
      g.strokeRect(s.x * px - 0.5, s.y * px - 0.5, s.w * px + 1, s.h * px + 1);
    }
  }, [picture, crop?.x, crop?.y, crop?.w, crop?.h, photos.paper, photos.size, perSheet]); // eslint-disable-line react-hooks/exhaustive-deps

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (d) setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y));
  }
  function changeZoom(z: number) {
    if (!picture) return;
    // Zoom around the middle of the frame, so the face stays put.
    const cx0 = (frame.w / 2 - offset.x) / scale;
    const cy0 = (frame.h / 2 - offset.y) / scale;
    const next = Math.max(frame.w / picture.width, frame.h / picture.height) * z;
    setZoom(z);
    setOffset({ x: frame.w / 2 - cx0 * next, y: frame.h / 2 - cy0 * next });
  }

  const total = Math.max(100, photos.price * copies);
  const canPay = Boolean(ref && crop && canTakeOrders && photos.available && (method === 'cash' ? cash : online));

  return (
    <>
      {!ref ? (
        <section className="mt-6 animate-rise">
          <h2 className="text-[0.95rem] font-bold">Your photo</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button onClick={() => camera.current?.click()} disabled={Boolean(uploading)} className="flex flex-col items-center rounded-3xl bg-ink px-4 py-8 text-white shadow-lift transition active:scale-[0.98] disabled:opacity-50">
              <Camera className="size-8" />
              <span className="mt-3 font-bold">Take photo</span>
            </button>
            <button onClick={() => pick.current?.click()} disabled={Boolean(uploading)} className="flex flex-col items-center rounded-3xl border-2 border-dashed border-line-strong bg-surface px-4 py-8 transition active:scale-[0.98] disabled:opacity-50">
              <ImagePlus className="size-8 text-ink-soft" />
              <span className="mt-3 font-bold">Choose photo</span>
            </button>
          </div>
          {uploading > 0 && <p className="mt-3 text-center text-sm text-ink-mute">{uploading >= 100 ? 'Getting your photo ready…' : `Uploading ${uploading}%`}</p>}
          <Card className="mt-4 p-4 text-sm text-ink-soft">
            <p className="font-semibold text-ink">For a good passport photo</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Stand in front of a plain, light wall</li>
              <li>Look straight at the camera, face fully visible</li>
              <li>Good light on the face, no shadows</li>
            </ul>
          </Card>
        </section>
      ) : (
        <>
          <section className="mt-6 animate-rise">
            <div className="flex items-center justify-between">
              <h2 className="text-[0.95rem] font-bold">Fit the face in the oval</h2>
              <button onClick={() => pick.current?.click()} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
                <RefreshCw className="size-4" /> Change photo
              </button>
            </div>
            <div className="mt-3 flex justify-center rounded-3xl bg-paper-2 p-5">
              <div
                ref={frameRef}
                className="relative w-full max-w-64 cursor-grab touch-none overflow-hidden rounded-md bg-white shadow-lift ring-1 ring-line active:cursor-grabbing"
                style={{ aspectRatio: `${size.w} / ${size.h}` }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
              >
                {picture && (
                  <img
                    src={picture.toDataURL('image/jpeg', 0.85)}
                    alt="Your photo"
                    draggable={false}
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{ left: offset.x, top: offset.y, width: picture.width * scale, height: picture.height * scale }}
                  />
                )}
                <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  <ellipse cx="50" cy="44" rx="30" ry="31" fill="none" stroke="white" strokeWidth="0.8" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm font-semibold text-ink-soft">Zoom</span>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} className="flex-1 accent-[#0b1220]" aria-label="Zoom" />
              <Button variant="secondary" size="sm" icon={<RotateCw className="size-4" />} onClick={() => setTurn(((turn + 90) % 360) as Turn)}>
                Rotate
              </Button>
            </div>
            <p className="mt-1 text-center text-xs text-ink-mute">Drag to move. The top of the head and the chin should be inside the frame.</p>
          </section>

          <section className="mt-8">
            <h2 className="text-[0.95rem] font-bold">Your sheet</h2>
            <p className="text-sm text-ink-mute">
              {plural(perSheet, 'photo')} of {size.w} × {size.h} mm on {PHOTO_PAPERS[photos.paper].label}
            </p>
            <div className="mt-3 flex justify-center rounded-3xl bg-paper-2 p-5">
              <canvas ref={sheet} className="max-h-96 w-auto max-w-full bg-white shadow-lift ring-1 ring-line" aria-label="Photo sheet preview" />
            </div>
            <Card className="mt-3 flex items-center justify-between p-4 pl-5">
              <div>
                <p className="font-bold">Sheets</p>
                <p className="text-sm text-ink-mute">{rupees(photos.price)} per sheet</p>
              </div>
              <Stepper value={copies} onChange={setCopies} max={Math.min(10, maxCopies)} />
            </Card>
          </section>

          {cash && online && (
            <section className="mt-6">
              <h2 className="text-[0.95rem] font-bold">How will you pay?</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <OptionCard active={method === 'online'} onClick={() => setMethod('online')} title="Pay online" hint="UPI, card, netbanking" icon={<CreditCard className="size-5" />} />
                <OptionCard active={method === 'cash'} onClick={() => setMethod('cash')} title="Cash" hint="Pay at the counter" icon={<Banknote className="size-5" />} />
              </div>
            </section>
          )}
        </>
      )}

      {error && <p className="mt-3 rounded-xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{error}</p>}
      <input ref={pick} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />

      <div className="h-36" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-xl">
        <div className="mx-auto max-w-lg px-5 pt-3">
          {payError && <p className="mb-2 text-center text-sm font-medium text-bad">{payError}</p>}
          <Button
            size="xl"
            className={cx('w-full')}
            disabled={!canPay}
            loading={paying}
            onClick={() => ref && crop && checkout(ref, { method, copies, turn, crop: { x: clampUnit(crop.x), y: clampUnit(crop.y), w: clampUnit(crop.w), h: clampUnit(crop.h) } })}
          >
            {!ref ? (
              'Take or choose a photo'
            ) : !photos.available ? (
              'Photo printer offline'
            ) : (
              <>
                {method === 'cash' ? `Place order, pay ${rupees(total)} cash` : `Pay ${rupees(total)} & print`} <ArrowRight className="size-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

const clampUnit = (v: number) => Math.min(1, Math.max(0, v));
