'use client';

import { CreditCard, LayoutGrid, ListChecks, Printer, QrCode, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Mark, Spinner } from '@/components/ui';
import { api, session } from '@/lib/api';
import { ShopContext, type ShopCtx } from './shop-context';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutGrid },
  { href: '/dashboard/jobs', label: 'Jobs', icon: ListChecks },
  { href: '/dashboard/printers', label: 'Printers', icon: Printer },
  { href: '/dashboard/payments', label: 'Payments', icon: CreditCard },
  { href: '/dashboard/qr', label: 'QR', icon: QrCode },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<Omit<ShopCtx, 'setShop'> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session.token()) {
      router.replace('/login');
      return;
    }
    api('/api/shop')
      .then((r) => {
        if (r.user.role === 'admin' && !session.viewShop()) return router.replace('/admin');
        setCtx(r);
      })
      .catch((e) => setError(e.message));
  }, [router]);

  // In the desktop app, a new cash order pops up even when the window is hidden in the tray.
  useEffect(() => {
    if (!ctx || !window.seedhaPrintDesktop) return;
    let last = -1;
    const check = () =>
      api<{ cashWaiting: number }>('/api/shop/overview')
        .then(({ cashWaiting }) => {
          if (last >= 0 && cashWaiting > last) new Notification('SeedhaPrint', { body: 'New cash order. Collect the money, then tap Cash received.' });
          last = cashWaiting;
        })
        .catch(() => {});
    void check();
    const t = setInterval(check, 8000);
    return () => clearInterval(t);
  }, [ctx]);

  if (!ctx) {
    return (
      <div className="grid min-h-dvh place-items-center">
        {error ? <p className="font-semibold">{error}</p> : <div className="flex flex-col items-center gap-4"><Mark size={40} /><Spinner /></div>}
      </div>
    );
  }

  const viewingAsAdmin = ctx.user.role === 'admin';
  return (
    <ShopContext.Provider value={{ ...ctx, setShop: (shop) => setCtx((c) => (c ? { ...c, shop } : c)) }}>
      <AppShell
        nav={NAV}
        title={ctx.shop.name}
        subtitle={[ctx.shop.area, ctx.shop.city].filter(Boolean).join(', ') || `Shop ${ctx.shop.code}`}
        user={ctx.user}
        banner={
          viewingAsAdmin
            ? {
                text: `Viewing ${ctx.shop.name} as admin`,
                onExit: () => {
                  session.setViewShop(null);
                  router.push('/admin');
                },
              }
            : null
        }
      >
        {children}
      </AppShell>
    </ShopContext.Provider>
  );
}
