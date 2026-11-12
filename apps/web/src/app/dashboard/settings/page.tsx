'use client';

import { useState } from 'react';
import { PHOTO_PAPERS, PHOTO_SIZES, photosPerSheet, type PhotoPaper, type PhotoSize } from '@seedhaprint/shared';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Field, Input, Select, Switch, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { rupees } from '@/lib/format';
import { useShop } from '../shop-context';

const toRupees = (p: number) => String(p / 100);
const toPaise = (r: string) => Math.round(parseFloat(r || '0') * 100);

export default function SettingsPage() {
  const { shop, setShop } = useShop();
  const toast = useToast();
  const [form, setForm] = useState({
    name: shop.name,
    area: shop.area,
    city: shop.city,
    phone: shop.phone,
    bw: toRupees(shop.rates.bwPerPage),
    color: toRupees(shop.rates.colorPerPage),
    colorEnabled: shop.rates.colorEnabled,
    duplexEnabled: shop.rates.duplexEnabled,
    cashEnabled: shop.cash.enabled,
    photos: shop.photos,
    photoPrice: toRupees(shop.photos.price),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: 'name' | 'area' | 'city' | 'phone' | 'bw' | 'color') => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const maxPhotos = photosPerSheet(form.photos.paper, form.photos.size);
  const setPhotos = (change: Partial<typeof form.photos>) => setForm({ ...form, photos: { ...form.photos, ...change } });
  const bw = toPaise(form.bw);
  const color = toPaise(form.color);
  const rateError = (p: number) => (p < 50 ? 'Minimum ₹0.50' : p > 100_000 ? 'Too high' : undefined);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/api/shop', {
        method: 'PATCH',
        json: { name: form.name, area: form.area, city: form.city, phone: form.phone, rates: { bwPerPage: bw, colorPerPage: color, colorEnabled: form.colorEnabled, duplexEnabled: form.duplexEnabled }, cash: { ...shop.cash, enabled: form.cashEnabled }, photos: { ...form.photos, perSheet: Math.min(form.photos.perSheet, maxPhotos), price: toPaise(form.photoPrice) } },
      });
      setShop(r.shop);
      toast('Settings saved');
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <PageHeader
        title="Settings"
        description="What customers see when they scan your QR."
        actions={
          <Button type="submit" loading={busy} disabled={Boolean(rateError(bw) || rateError(color) || (form.photos.enabled && toPaise(form.photoPrice) < 100))}>
            Save changes
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-bold">Shop details</h2>
          <div className="mt-5 space-y-4">
            <Field label="Shop name">
              <Input value={form.name} onChange={set('name')} required minLength={2} maxLength={80} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Area / market">
                <Input value={form.area} onChange={set('area')} placeholder="Sector 17" maxLength={80} />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={set('city')} placeholder="Chandigarh" maxLength={60} />
              </Field>
            </div>
            <Field label="Shop phone" hint="Shown to customers if something goes wrong.">
              <Input value={form.phone} onChange={set('phone')} inputMode="tel" maxLength={20} />
            </Field>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-bold">Prices</h2>
          <p className="mt-1 text-sm text-ink-mute">Per A4 page. Customers pay pages × copies × rate.</p>
          <div className="mt-5 space-y-4">
            <Field label="Black & white, per page" error={rateError(bw)}>
              <Input prefix="₹" inputMode="decimal" value={form.bw} onChange={set('bw')} />
            </Field>
            <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Colour printing</p>
                <p className="text-xs text-ink-mute">Turn off if you have no colour printer.</p>
              </div>
              <Switch checked={form.colorEnabled} onChange={(v) => setForm({ ...form, colorEnabled: v })} label="Colour printing" />
            </div>
            {form.colorEnabled && (
              <Field label="Colour, per page" error={rateError(color)}>
                <Input prefix="₹" inputMode="decimal" value={form.color} onChange={set('color')} />
              </Field>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Printing on both sides</p>
              <p className="text-xs text-ink-mute">Customers pay per printed page, same as single side.</p>
            </div>
            <Switch checked={form.duplexEnabled} onChange={(v) => setForm({ ...form, duplexEnabled: v })} label="Printing on both sides" />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Accept cash</p>
              <p className="text-xs text-ink-mute">Customers can choose to pay at the counter.</p>
            </div>
            <Switch checked={form.cashEnabled} onChange={(v) => setForm({ ...form, cashEnabled: v })} label="Accept cash" />
          </div>
          <div className="mt-5 rounded-xl bg-paper p-4 text-sm">
            <p className="font-semibold">Example</p>
            <p className="mt-1 text-ink-mute">
              A 10 page document, 2 copies, B/W: <span className="font-mono font-semibold text-ink">{rupees(Math.max(100, bw * 20))}</span>
            </p>
          </div>
        </Card>

        <Card className="p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Passport photos</h2>
              <p className="mt-1 text-sm text-ink-mute">Customers take or upload one photo, fit the face, and a full sheet prints. Turn it on when your photo paper is loaded.</p>
            </div>
            <Switch checked={form.photos.enabled} onChange={(enabled) => setPhotos({ enabled })} label="Passport photos" />
          </div>
          {form.photos.enabled && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Photo paper" hint={form.photos.paper === '4x6' ? 'Set the photo printer’s paper size to 4 × 6 in Windows.' : undefined}>
                <Select value={form.photos.paper} onChange={(e) => setPhotos({ paper: e.target.value as PhotoPaper })}>
                  {Object.entries(PHOTO_PAPERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </Field>
              <Field label="Photo size">
                <Select value={form.photos.size} onChange={(e) => setPhotos({ size: e.target.value as PhotoSize })}>
                  {Object.entries(PHOTO_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </Field>
              <Field label="Photos on each sheet" hint={`Up to ${maxPhotos} fit`}>
                <Select value={Math.min(form.photos.perSheet, maxPhotos)} onChange={(e) => setPhotos({ perSheet: Number(e.target.value) })}>
                  {Array.from({ length: maxPhotos }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
              <Field label="Price per sheet" error={toPaise(form.photoPrice) < 100 ? 'Minimum ₹1' : undefined}>
                <Input prefix="₹" inputMode="decimal" value={form.photoPrice} onChange={(e) => setForm({ ...form, photoPrice: e.target.value })} />
              </Field>
            </div>
          )}
        </Card>
      </div>
    </form>
  );
}
