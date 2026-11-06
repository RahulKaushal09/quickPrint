'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Field, Input, Logo, Mark } from '@/components/ui';
import { api, session } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session.token()) router.replace('/dashboard');
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ token: string; user: { role: string } }>('/api/auth/login', { method: 'POST', json: { phone, password } });
      session.clear();
      session.set(r.token);
      router.replace(r.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col">
        <Logo light />
        <div className="relative z-10 mt-auto max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/50">For print shops</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight">Your counter keeps printing, even when you&rsquo;re busy.</h1>
          <p className="mt-4 text-white/60">Customers scan, upload and pay on their phone. Paid jobs print on your printer by themselves.</p>
        </div>
        <div className="pointer-events-none absolute -right-24 top-1/4 opacity-90">
          <Mark size={420} />
        </div>
        <div className="cmyk-bar absolute inset-x-0 bottom-0 h-1.5" />
      </section>

      <section className="flex flex-col px-6 py-10 sm:px-12">
        <Logo className="lg:hidden" />
        <div className="m-auto w-full max-w-sm animate-rise">
          <h2 className="text-3xl font-extrabold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-ink-mute">Shop owners and QuickPrint admins.</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <Field label="Phone number">
              <Input inputMode="numeric" autoComplete="username" placeholder="10 digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} required />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm font-medium text-bad">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Sign in <ArrowRight className="size-4" />
            </Button>
          </form>
          <p className="mt-8 text-center text-sm text-ink-mute">Forgot your password? Call your QuickPrint contact.</p>
        </div>
      </section>
    </main>
  );
}
