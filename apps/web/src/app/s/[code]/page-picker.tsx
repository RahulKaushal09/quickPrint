'use client';

import { Check, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { PageChoice, Sides } from '@seedhaprint/shared';
import { API_URL } from '@/lib/api';
import { cx, plural } from '@/lib/format';

export interface PageItem extends PageChoice {
  on: boolean;
}

/**
 * Every uploaded page as an upright A4 sheet: tick what to print, turn a page
 * on its sheet, move it. With both sides on, each page is marked as the front
 * or back of its sheet, so an ID's two sides can land on one piece of paper.
 * If a phone's browser can't draw previews, all the buttons still work.
 */
export function PagePicker({ jobRef, total, items, sides, onChange }: { jobRef: string; total: number; items: PageItem[]; sides: Sides; onChange: (items: PageItem[]) => void }) {
  const doc = useRef<any>(null);
  const [ready, setReady] = useState(0); // bumps when a newer document is loaded
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    let task: any;
    (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
      // The total is in the address so that adding files fetches the longer document.
      task = pdfjs.getDocument({ url: `${API_URL}/api/public/jobs/${jobRef}/preview?pages=${total}` });
      const loaded = await task.promise;
      if (dead) return void loaded.destroy();
      doc.current = loaded;
      setReady((n) => n + 1);
    })().catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
      void task?.destroy();
    };
  }, [jobRef, total]);

  const selected = items.filter((i) => i.on);
  const set = (next: PageItem[]) => onChange(next);
  const update = (p: number, change: Partial<PageItem>) => set(items.map((i) => (i.p === p ? { ...i, ...change } : i)));
  const move = (index: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    set(next);
  };

  let printed = -1;
  return (
    <div className="mt-3 animate-rise rounded-3xl border border-line bg-surface p-3 shadow-card">
      <div className="flex items-center justify-between gap-2 px-1 pb-3">
        <p className="text-sm font-semibold">
          {selected.length} of {plural(items.length, 'page')} selected
        </p>
        <div className="flex items-center gap-1 text-sm font-semibold text-ink-soft">
          <button type="button" onClick={() => set(items.map((i) => ({ ...i, on: selected.length !== items.length })))} className="rounded-lg px-2 py-1.5 hover:bg-paper-2 hover:text-ink">
            {selected.length === items.length ? 'Clear all' : 'Select all'}
          </button>
          <button type="button" onClick={() => set(items.map((i) => ({ ...i, r: ((i.r + 90) % 360) as PageItem['r'] })))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-paper-2 hover:text-ink">
            <RotateCw className="size-3.5" /> Rotate all
          </button>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {items.map((item, index) => {
          if (item.on) printed++;
          const marker = !item.on ? null : sides === 'double' ? { sheet: Math.floor(printed / 2) + 1, back: printed % 2 === 1 } : { sheet: printed + 1, back: false };
          return (
            <li key={item.p} className={cx('overflow-hidden rounded-2xl border-2 transition', item.on ? 'border-ink' : 'border-line opacity-60')}>
              <button type="button" role="checkbox" aria-checked={item.on} aria-label={`Print page ${item.p}`} onClick={() => update(item.p, { on: !item.on })} className="block w-full text-left">
                {/* Above the sheet, so the tick and marker never hide what is on the page. */}
                <span className="flex h-11 items-center gap-2 bg-surface px-2">
                  <span className={cx('grid size-6 shrink-0 place-items-center rounded-md border-2', item.on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white')}>
                    {item.on && <Check className="size-3.5" strokeWidth={3.5} />}
                  </span>
                  {marker ? (
                    <span className={cx('truncate rounded-md px-1.5 py-0.5 text-[0.68rem] font-bold', sides === 'double' ? (marker.back ? 'bg-magenta text-white' : 'bg-cyan text-white') : 'bg-paper-2 text-ink-soft')}>
                      {sides === 'double' ? `Sheet ${marker.sheet} · ${marker.back ? 'Back' : 'Front'}` : `Sheet ${marker.sheet}`}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-ink-mute">Not printing</span>
                  )}
                </span>
                <span className="block bg-paper-2 p-2">
                  <Sheet doc={doc} ready={ready} failed={failed} page={item.p} rotation={item.r} />
                </span>
              </button>
              <div className="flex items-center justify-between bg-surface px-1 py-1">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="grid size-10 place-items-center rounded-lg hover:bg-paper-2 disabled:opacity-25" aria-label="Move earlier">
                  <ChevronLeft className="size-5" />
                </button>
                <button type="button" onClick={() => update(item.p, { r: ((item.r + 90) % 360) as PageItem['r'] })} className="grid size-10 place-items-center rounded-lg hover:bg-paper-2" aria-label={`Rotate page ${item.p}`}>
                  <RotateCw className="size-5" />
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="grid size-10 place-items-center rounded-lg hover:bg-paper-2 disabled:opacity-25" aria-label="Move later">
                  <ChevronRight className="size-5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {sides === 'double' && selected.length % 2 === 1 && <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-xs text-ink-soft">The back of the last sheet stays blank.</p>}
    </div>
  );
}

/** One upright A4 sheet. Draws its page only when scrolled near, so long documents stay quick. */
const Sheet = memo(function Sheet({ doc, ready, failed, page, rotation }: { doc: React.RefObject<any>; ready: number; failed: boolean; page: number; rotation: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const seen = new IntersectionObserver((e) => e[0]?.isIntersecting && setNear(true), { rootMargin: '300px' });
    if (box.current) seen.observe(box.current);
    return () => seen.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !ready || !doc.current || !canvas.current) return;
    let render: any;
    let stop = false;
    (async () => {
      const p = await doc.current.getPage(page);
      if (stop) return;
      const angle = (p.rotate + rotation) % 360;
      const base = p.getViewport({ scale: 1, rotation: angle });
      const viewport = p.getViewport({ scale: Math.min(360 / base.width, 500 / base.height), rotation: angle });
      const el = canvas.current!;
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      render = p.render({ canvas: el, viewport });
      await render.promise;
    })().catch(() => {});
    return () => {
      stop = true;
      render?.cancel();
    };
  }, [near, ready, doc, page, rotation]);

  return (
    <div ref={box} className="flex aspect-[210/297] w-full items-center justify-center overflow-hidden bg-white shadow-card ring-1 ring-line">
      {failed ? <span className="px-2 text-center text-xs text-ink-mute">Page {page}</span> : <canvas ref={canvas} className="max-h-full max-w-full" />}
    </div>
  );
});
