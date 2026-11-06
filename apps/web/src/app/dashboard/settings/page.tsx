'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Button, Card, Field, Input, Switch, useToast } from '@/components/ui';
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
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const bw = toPaise(form.bw);
  const color = toPaise(form.color);
  const rateError = (p: number) => (p < 50 ? 'Minimum ₹0.50' : p > 100_000 ? 'Too high' : undefined);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/api/shop', {
        method: 'PATCH',
        json: { name: form.name, area: form.area, city: form.city, phone: form.phone, rates: { bwPerPage: bw, colorPerPage: color, colorEnabled: form.colorEnabled } },
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
          <div className="mt-5 rounded-xl bg-paper p-4 text-sm">
            <p className="font-semibold">Example</p>
            <p className="mt-1 text-ink-mute">
              A 10 page document, 2 copies, B/W: <span className="font-mono font-semibold text-ink">{rupees(Math.max(100, bw * 20))}</span>
            </p>
          </div>
        </Card>
      </div>
    </form>
  );
}
