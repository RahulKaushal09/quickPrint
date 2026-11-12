'use client';

import { useState } from 'react';
import { DEFAULT_PHOTO_PACKS, MAX_PHOTO_PACKS, MAX_PHOTOS_PER_ORDER, PHOTO_PAPERS, PHOTO_SIZES, photoSheets, photosPerSheet, type PhotoPaper, type PhotoSize } from '@seedhaprint/shared';
import { PageHeader } from '@/components/app-shell';
import { MessageCircle, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Select, Switch, useToast } from '@/components/ui';
import { METHOD_LABEL, PLAN_LABEL, PLAN_TONE, planDate } from '@/lib/plan';
import { whatsappLink } from '@/lib/site';
import { api } from '@/lib/api';
import { cx, rupees } from '@/lib/format';
import { useShop } from '../shop-context';

const toRupees = (p: number) => String(p / 100);
const toPaise = (r: string) => Math.round(parseFloat(r || '0') * 100);

export default function SettingsPage() {
  const { shop, setShop, subscription } = useShop();
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
    // Edited as text so a half-typed number doesn't jump around.
    packs: (shop.photos.packs?.length ? shop.photos.packs : DEFAULT_PHOTO_PACKS).map((p) => ({ count: String(p.count), price: toRupees(p.price), enabled: p.enabled })),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: 'name' | 'area' | 'city' | 'phone' | 'bw' | 'color') => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const maxPhotos = photosPerSheet(form.photos.paper, form.photos.size);
  type PackRow = (typeof form.packs)[number];
  const setPack = (i: number, change: Partial<PackRow>) => setForm({ ...form, packs: form.packs.map((p, k) => (k === i ? { ...p, ...change } : p)) });
  const packError = (p: PackRow, i: number) => {
    const n = Number(p.count);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PHOTOS_PER_ORDER) return `1 to ${MAX_PHOTOS_PER_ORDER} photos`;
    if (form.packs.findIndex((q) => Number(q.count) === n) !== i) return 'Already listed';
    if (toPaise(p.price) < 100) return 'Minimum ₹1';
    return undefined;
  };
  const packsInvalid = form.photos.enabled && (form.packs.some((p, i) => packError(p, i)) || !form.packs.some((p) => p.enabled));
  function addPack() {
    const used = new Set(form.packs.map((p) => Number(p.count)));
    const next = [6, 12, 16, 20, 1, 3, 5, 7, 9].find((n) => !used.has(n)) ?? '';
    setForm({ ...form, packs: [...form.packs, { count: String(next), price: '', enabled: true }] });
  }
  const setPhotos = (change: Partial<typeof form.photos>) => setForm({ ...form, photos: { ...form.photos, ...change } });
  const bw = toPaise(form.bw);
  const color = toPaise(form.color);
  const rateError = (p: number) => (p < 50 ? 'Minimum ₹0.50' : p > 100_000 ? 'Too high' : undefined);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (packsInvalid) {
      toast(form.packs.some((p) => p.enabled) ? 'Fix the passport photo options first' : 'Turn on at least one passport photo option', 'bad');
      return;
    }
    setBusy(true);
    try {
      const r = await api('/api/shop', {
        method: 'PATCH',
        json: { name: form.name, area: form.area, city: form.city, phone: form.phone, rates: { bwPerPage: bw, colorPerPage: color, colorEnabled: form.colorEnabled, duplexEnabled: form.duplexEnabled }, cash: { ...shop.cash, enabled: form.cashEnabled }, photos: { enabled: form.photos.enabled, size: form.photos.size, paper: form.photos.paper, packs: form.packs.map((p) => ({ count: Number(p.count), price: toPaise(p.price), enabled: p.enabled })) } },
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
          <Button type="submit" loading={busy} disabled={Boolean(rateError(bw) || rateError(color))}>
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
              <p className="mt-1 text-sm text-ink-mute">Customers take or upload one photo, fit the face, pick how many photos they want, and it prints. Turn it on when your photo paper is loaded.</p>
            </div>
            <Switch checked={form.photos.enabled} onChange={(enabled) => setPhotos({ enabled })} label="Passport photos" />
          </div>
          {form.photos.enabled && (
            <div className="mt-5">
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>

              <p className="mt-6 text-sm font-semibold">What customers can order</p>
              <p className="mt-0.5 text-xs text-ink-mute">The price is for all the photos together. Up to {maxPhotos} fit on one sheet; more print on extra sheets, split evenly.</p>
              <ul className="mt-3 space-y-2">
                {form.packs.map((p, i) => {
                  const err = packError(p, i);
                  const sheets = Number(p.count) >= 1 && Number(p.count) <= MAX_PHOTOS_PER_ORDER ? photoSheets(form.photos.paper, form.photos.size, Number(p.count)).length : 0;
                  return (
                    <li key={i} className={cx('rounded-2xl border border-line p-3 transition', !p.enabled && 'bg-paper')}>
                      <div className="flex flex-wrap items-center gap-3">
                        <Switch checked={p.enabled} onChange={(enabled) => setPack(i, { enabled })} label={`Offer ${p.count || 'these'} photos`} />
                        <div className="w-20">
                          <Input inputMode="numeric" className="text-center" value={p.count} onChange={(e) => setPack(i, { count: e.target.value.replace(/\D/g, '') })} aria-label="Number of photos" />
                        </div>
                        <span className="text-sm font-semibold">photos for</span>
                        <div className="w-28">
                          <Input prefix="₹" inputMode="decimal" value={p.price} onChange={(e) => setPack(i, { price: e.target.value })} aria-label="Price for these photos" />
                        </div>
                        {sheets > 0 && <span className="text-xs text-ink-mute">{sheets === 1 ? '1 sheet' : `${sheets} sheets`}</span>}
                        <button type="button" onClick={() => setForm({ ...form, packs: form.packs.filter((_, k) => k !== i) })} className="ml-auto grid size-9 place-items-center rounded-lg text-ink-mute hover:bg-bad-soft hover:text-bad" aria-label={`Remove ${p.count} photos`} title="Remove">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      {err && <p className="mt-2 text-xs font-medium text-bad">{err}</p>}
                    </li>
                  );
                })}
              </ul>
              {form.packs.length < MAX_PHOTO_PACKS && (
                <Button type="button" variant="secondary" size="sm" className="mt-3" icon={<Plus className="size-4" />} onClick={addPack}>
                  Add an option
                </Button>
              )}
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Your plan</h2>
              <p className="mt-1 text-sm text-ink-mute">
                {subscription.state === 'free'
                  ? 'Your shop is on a free plan.'
                  : subscription.state === 'off'
                    ? 'Your plan has ended. Customers can’t order until it is renewed.'
                    : `${rupees(subscription.fee)} a month, paid until ${planDate(subscription.paidUntil)}.`}
              </p>
            </div>
            <Badge tone={PLAN_TONE[subscription.state]}>{PLAN_LABEL[subscription.state]}</Badge>
          </div>
          {shop.subscription?.payments?.length ? (
            <ul className="mt-4 divide-y divide-line text-sm">
              {[...shop.subscription.payments].reverse().slice(0, 6).map((p, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-mono font-semibold">{rupees(p.amount)}</span>
                    <span className="text-ink-mute">
                      {' '}
                      · {p.months} month{p.months === 1 ? '' : 's'} · {METHOD_LABEL[p.method]}
                    </span>
                  </span>
                  <span className="text-xs text-ink-mute">{planDate(p.at)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {subscription.state !== 'free' && (
            <a href={whatsappLink(`Hi, I want to renew SeedhaPrint for ${shop.name}.`)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block">
              <Button type="button" variant="secondary" icon={<MessageCircle className="size-4" />}>
                Renew on WhatsApp
              </Button>
            </a>
          )}
        </Card>
      </div>
    </form>
  );
}
