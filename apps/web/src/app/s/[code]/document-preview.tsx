'use client';

import { ChevronLeft, ChevronRight, RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';
import { cx } from '@/lib/format';

export type Rotation = 0 | 90 | 180 | 270;

/**
 * Shows the document on the upright A4 sheet it prints on. Rotating turns the
 * document on the paper, never the paper, and applies to every page. If a
 * phone's browser can't draw the preview, the rotate buttons still work.
 */
export function DocumentPreview({ jobRef, pages, rotation, onRotate }: { jobRef: string; pages: number; rotation: Rotation; onRotate: (r: Rotation) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const doc = useRef<any>(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let dead = false;
    let task: any;
    (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
      task = pdfjs.getDocument({ url: `${API_URL}/api/public/jobs/${jobRef}/preview` });
      const loaded = await task.promise;
      if (dead) return void loaded.destroy();
      doc.current = loaded;
      setState('ready');
    })().catch(() => !dead && setState('failed'));
    return () => {
      dead = true;
      void task?.destroy();
      doc.current = null;
    };
  }, [jobRef]);

  useEffect(() => {
    if (state !== 'ready' || !doc.current || !canvas.current) return;
    let render: any;
    (async () => {
      const p = await doc.current.getPage(page);
      const angle = (p.rotate + rotation) % 360;
      const base = p.getViewport({ scale: 1, rotation: angle });
      // Sharp on phone screens without drawing more than the box needs.
      const scale = Math.min(620 / base.width, 620 / base.height);
      const viewport = p.getViewport({ scale, rotation: angle });
      const el = canvas.current!;
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      render = p.render({ canvas: el, viewport });
      await render.promise;
    })().catch((e) => e?.name !== 'RenderingCancelledException' && setState('failed'));
    return () => render?.cancel();
  }, [state, page, rotation]);

  const turn = (by: number) => onRotate((((rotation + by) % 360) + 360) % 360 as Rotation);

  return (
    <div className="mt-3 animate-rise overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div className="paper-grid flex h-96 items-center justify-center bg-paper-2 p-4">
        {state === 'failed' ? (
          <p className="max-w-56 text-center text-sm text-ink-mute">Preview is not available on this phone. You can still rotate the document below.</p>
        ) : (
          <div className="flex aspect-[210/297] h-full items-center justify-center overflow-hidden bg-white shadow-lift ring-1 ring-line" aria-label="A4 paper">
            <canvas ref={canvas} aria-label={`Page ${page} preview`} className={cx('max-h-full max-w-full transition-opacity', state === 'loading' ? 'opacity-0' : 'opacity-100')} />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => turn(-90)} className="grid size-11 place-items-center rounded-xl border border-line-strong transition hover:bg-paper-2 active:scale-95" aria-label="Rotate left">
            <RotateCcw className="size-5" />
          </button>
          <button type="button" onClick={() => turn(90)} className="grid size-11 place-items-center rounded-xl border border-line-strong transition hover:bg-paper-2 active:scale-95" aria-label="Rotate right">
            <RotateCw className="size-5" />
          </button>
          <span className="whitespace-nowrap pl-2 text-sm font-semibold text-ink-soft">{rotation ? `${rotation}°` : 'Rotate on A4'}</span>
        </div>
        {pages > 1 && state !== 'failed' && (
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="grid size-10 place-items-center rounded-lg transition hover:bg-paper-2 disabled:opacity-30" aria-label="Previous page">
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-12 text-center font-mono text-sm tabular">
              {page}/{pages}
            </span>
            <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="grid size-10 place-items-center rounded-lg transition hover:bg-paper-2 disabled:opacity-30" aria-label="Next page">
              <ChevronRight className="size-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
