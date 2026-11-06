'use client';

import { Check, CircleAlert, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Badge, Button, Card, Field, Input, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';

interface Payments {
  connected: boolean;
  keyId: string;
  mode: 'live' | 'test' | null;
  verifiedAt?: string;
  webhookUrl: string;
  webhookSecret: string;
  webhookSeenAt?: string;
}

export default function PaymentsPage() {
  const toast = useToast();
  const [data, setData] = useState<Payments | null>(null);
  const [editing, setEditing] = useState(false);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Payments>('/api/shop/payments').then(setData).catch((e) => toast(e.message, 'bad'));
  }, [toast]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setData(await api<Payments>('/api/shop/payments', { method: 'PUT', json: { keyId, keySecret } }));
      setKeyId('');
      setKeySecret('');
      setEditing(false);
      toast('Razorpay connected');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect Razorpay? Customers will not be able to pay until you connect it again.')) return;
    setData(await api<Payments>('/api/shop/payments', { method: 'DELETE' }));
    toast('Razorpay disconnected');
  }

  const copy = (text: string, label: string) => navigator.clipboard.writeText(text).then(() => toast(`${label} copied`));

  if (!data) return <Skeleton className="h-96" />;
  const showForm = !data.connected || editing;

  return (
    <>
      <PageHeader title="Payments" description="Customers pay into your own Razorpay account, and the money settles to your bank." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className={cx('flex items-center gap-3 px-5 py-4 sm:px-6', data.connected ? 'bg-ok-soft' : 'bg-warn-soft')}>
            {data.connected ? <Check className="size-5 text-ok" strokeWidth={3} /> : <CircleAlert className="size-5 text-warn" />}
            <div className="min-w-0 flex-1">
              <p className="font-bold">{data.connected ? 'Razorpay connected' : 'Razorpay not connected'}</p>
              <p className="truncate text-sm text-ink-soft">{data.connected ? `${data.keyId} · checked ${timeAgo(data.verifiedAt)}` : 'Customers can’t pay you until you connect it.'}</p>
            </div>
            {data.mode === 'test' && <Badge tone="warn">Test mode</Badge>}
            {data.mode === 'live' && <Badge tone="ok">Live</Badge>}
          </div>

          <div className="p-5 sm:p-6">
            {data.mode === 'test' && <p className="mb-5 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">These are test keys, so no real money is collected and jobs still print. Replace them with live keys before opening to customers.</p>}

            {showForm ? (
              <form onSubmit={connect} className="space-y-4">
                <Field label="Key ID">
                  <Input value={keyId} onChange={(e) => setKeyId(e.target.value.trim())} placeholder="rzp_live_XXXXXXXXXXXXXX" autoComplete="off" spellCheck={false} required />
                </Field>
                <Field label="Key Secret" hint="Stored encrypted. It is never shown again after you save.">
                  <Input type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value.trim())} autoComplete="new-password" required />
                </Field>
                {error && <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{error}</p>}
                <div className="flex gap-2">
                  <Button type="submit" loading={busy}>
                    Check and connect
                  </Button>
                  {editing && (
                    <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Change keys
                </Button>
                <Button variant="ghost" onClick={disconnect}>
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-bold">How to get your keys</h2>
          <ol className="mt-4 space-y-3 text-sm text-ink-soft">
            {[
              <>Sign in to your Razorpay account, or create one. Razorpay checks your business documents before live payments work.</>,
              <>
                Open <b className="text-ink">Account &amp; Settings → API Keys</b> and click <b className="text-ink">Generate Key</b>.
              </>,
              <>Copy the Key ID and Key Secret into this page. Razorpay shows the secret only once, so save it safely.</>,
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>
          <a href="https://dashboard.razorpay.com" target="_blank" rel="noopener noreferrer" className="mt-5 inline-block">
            <Button variant="secondary" icon={<ExternalLink className="size-4" />}>
              Open Razorpay
            </Button>
          </a>
          <p className="mt-5 flex gap-2 text-xs text-ink-mute">
            <ShieldCheck className="size-4 shrink-0" /> Razorpay charges its own fee on each payment, taken from your account.
          </p>
        </Card>
      </div>

      {data.connected && (
        <Card className="mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Webhook</h2>
            {data.webhookSeenAt ? <Badge tone="ok">Last received {timeAgo(data.webhookSeenAt)}</Badge> : <Badge tone="warn">Nothing received yet</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            This makes sure a job prints even if the customer closes their phone straight after paying. In Razorpay open <b className="text-ink">Account &amp; Settings → Webhooks → Add New Webhook</b>, paste these two values, and tick the events <b className="text-ink">payment.captured</b> and <b className="text-ink">order.paid</b>.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {[
              ['Webhook URL', data.webhookUrl],
              ['Secret', data.webhookSecret],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="mb-1.5 text-sm font-semibold">{label}</p>
                <div className="flex items-center gap-2 rounded-xl bg-paper py-1 pl-3 pr-1">
                  <code className="min-w-0 flex-1 truncate font-mono text-sm">{value}</code>
                  <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={() => copy(value!, label!)}>
                    Copy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
