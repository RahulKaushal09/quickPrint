'use client';

import { Copy, Download, ExternalLink, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Mark, useToast } from '@/components/ui';
import { rupees } from '@/lib/format';
import { useShop } from '../shop-context';

export default function QrPage() {
  const { shop, qrUrl } = useShop();
  const toast = useToast();
  const [svg, setSvg] = useState('');

  useEffect(() => {
    // High error correction so a scuffed or partly covered poster still scans.
    QRCode.toString(qrUrl, { type: 'svg', errorCorrectionLevel: 'H', margin: 0, color: { dark: '#0b1220', light: '#ffffff' } }).then(setSvg);
  }, [qrUrl]);

  async function downloadPng() {
    const url = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'H', width: 1600, margin: 2, color: { dark: '#0b1220', light: '#ffffff' } });
    const a = document.createElement('a');
    a.href = url;
    a.download = `seedhaprint-${shop.code}.png`;
    a.click();
  }

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="QR poster"
          description="Print this on A4 and stick it at the counter, at eye level. One QR per shop, it never changes."
          actions={
            <>
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={downloadPng}>
                QR image
              </Button>
              <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
                Print poster
              </Button>
            </>
          }
        />
        <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-sm">{qrUrl}</code>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard.writeText(qrUrl).then(() => toast('Link copied'))}>
              Copy link
            </Button>
            <a href={qrUrl} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm" icon={<ExternalLink className="size-4" />}>
                Open
              </Button>
            </a>
          </div>
        </Card>
      </div>

      {/* A4 poster: 210 x 297 mm */}
      <div className="flex justify-center print:block">
        <div
          id="poster"
          className="relative flex aspect-[210/297] w-full max-w-[560px] flex-col overflow-hidden bg-white text-ink shadow-lift ring-1 ring-line print:w-[210mm] print:max-w-none print:shadow-none print:ring-0"
          style={{ containerType: 'inline-size' }}
        >
          <div className="cmyk-bar h-[2.2cqw]" />
          <div className="flex flex-1 flex-col items-center px-[8cqw] pt-[7cqw] text-center">
            <div className="flex items-center gap-[1.6cqw] text-[3.4cqw] font-extrabold uppercase tracking-[0.2em] text-ink-soft">
              <Mark size={22} /> SeedhaPrint
            </div>
            <h2 className="mt-[4cqw] text-[8.6cqw] font-extrabold leading-[1.02] tracking-tight">
              Print from
              <br />
              your phone
            </h2>
            <p className="mt-[2.4cqw] text-[3.6cqw] font-medium text-ink-soft">No WhatsApp, no pen drive, no waiting.</p>

            <div className="relative mt-[5cqw] rounded-[4cqw] border-[0.5cqw] border-ink p-[3.2cqw]">
              <div className="size-[44cqw] [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
              <span className="absolute -top-[2.4cqw] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-[3cqw] py-[0.8cqw] text-[2.6cqw] font-bold uppercase tracking-[0.16em] text-white">Scan me</span>
            </div>

            <div className="mt-[6cqw] grid w-full grid-cols-3 gap-[2.4cqw]">
              {[
                ['1', 'Scan', 'with any phone camera'],
                ['2', 'Upload & pay', 'PDF or photo, UPI'],
                ['3', 'Collect', 'show your pickup code'],
              ].map(([n, t, d]) => (
                <div key={n} className="rounded-[2.4cqw] bg-paper px-[1.6cqw] py-[2.6cqw]">
                  <span className="mx-auto grid size-[5.4cqw] place-items-center rounded-full bg-ink text-[2.8cqw] font-bold text-white">{n}</span>
                  <p className="mt-[1.4cqw] text-[3.1cqw] font-bold leading-tight">{t}</p>
                  <p className="mt-[0.4cqw] text-[2.3cqw] leading-tight text-ink-mute">{d}</p>
                </div>
              ))}
            </div>

            <div className="mt-auto flex w-full items-end justify-between border-t-[0.3cqw] border-dashed border-line-strong pb-[6cqw] pt-[3.4cqw] text-left">
              <div>
                <p className="text-[4.2cqw] font-extrabold leading-tight">{shop.name}</p>
                <p className="text-[2.6cqw] text-ink-mute">{[shop.area, shop.city].filter(Boolean).join(', ') || `Shop ${shop.code}`}</p>
              </div>
              <div className="text-right text-[2.8cqw] leading-snug">
                <p>
                  B/W <b className="font-mono">{rupees(shop.rates.bwPerPage)}</b>/page
                </p>
                {shop.rates.colorEnabled && (
                  <p>
                    Colour <b className="font-mono">{rupees(shop.rates.colorPerPage)}</b>/page
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@media print { body * { visibility: hidden; } #poster, #poster * { visibility: visible; } #poster { position: fixed; inset: 0; margin: 0 auto; } }`}</style>
    </>
  );
}
