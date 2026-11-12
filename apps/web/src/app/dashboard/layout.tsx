'use client';

import { CreditCard, LayoutGrid, ListChecks, Printer, QrCode, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell, type Notice } from '@/components/app-shell';
import { Mark, Spinner } from '@/components/ui';
import { api, session } from '@/lib/api';
import { rupees } from '@/lib/format';
import { planDate, type Plan } from '@/lib/plan';
import { whatsappLink } from '@/lib/site';
import { ShopContext, type ShopCtx } from './shop-context';

/** What the owner sees about their SeedhaPrint subscription, if anything needs saying. */
function planNotice(plan: Plan, shopName: string): Notice | null {
  const pay = { label: 'Renew on WhatsApp', href: whatsappLink(`Hi, I want to renew SeedhaPrint for ${shopName}.`) };
  switch (plan.state) {
    case 'due_soon':
      return { tone: 'warn', title: `Your plan renews on ${planDate(plan.paidUntil)}`, text: `${rupees(plan.fee)} a month. Renew before then to keep taking orders.`, action: pay };
    case 'grace':
      return {
        tone: 'grace',
        title: `Your plan ended on ${planDate(plan.paidUntil)}`,
        text: `Customers can still order until ${planDate(plan.graceUntil)}. Renew to avoid being switched off.`,
        action: pay,
      };
    case 'off':
      return {
        tone: 'bad',
        title: 'Your plan has ended, customers can’t order',
        text: 'Your QR shows the shop as unavailable. Jobs already paid still print. Renew and it switches back on straight away.',
        action: pay,
      };
    default:
      return null;
  }
}

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
        notice={planNotice(ctx.subscription, ctx.shop.name)}
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
