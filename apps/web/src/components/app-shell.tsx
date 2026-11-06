'use client';

import { ArrowLeft, LogOut, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo, ToastProvider } from '@/components/ui';
import { session } from '@/lib/api';
import { cx, initials } from '@/lib/format';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Sidebar on desktop, top bar + bottom tabs on phones. */
export function AppShell({
  nav,
  title,
  subtitle,
  user,
  banner,
  children,
}: {
  nav: NavItem[];
  title: string;
  subtitle?: string;
  user?: { name: string; phone: string } | null;
  banner?: { text: string; onExit: () => void } | null;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === nav[0]!.href ? path === href : path.startsWith(href));
  const logout = () => {
    session.clear();
    router.replace('/login');
  };

  return (
    <ToastProvider>
      <div className="min-h-dvh lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink text-white lg:flex">
          <div className="px-6 pb-6 pt-7">
            <Logo light />
          </div>
          <div className="mx-4 mb-4 rounded-xl bg-white/[0.06] px-3.5 py-3">
            <p className="truncate text-sm font-bold">{title}</p>
            {subtitle && <p className="truncate text-xs text-white/50">{subtitle}</p>}
          </div>
          <nav className="flex-1 space-y-0.5 px-3">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cx(
                  'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.93rem] font-semibold transition',
                  active(href) ? 'bg-white text-ink' : 'text-white/65 hover:bg-white/[0.07] hover:text-white',
                )}
              >
                <Icon className="size-[1.15rem]" />
                {label}
              </Link>
            ))}
          </nav>
          {user && (
            <div className="m-3 flex items-center gap-3 rounded-xl border border-white/10 p-3">
              <span className="grid size-9 place-items-center rounded-full bg-white/10 text-sm font-bold">{initials(user.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-white/45">{user.phone}</p>
              </div>
              <button onClick={logout} className="grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" />
              </button>
            </div>
          )}
          <div className="cmyk-bar h-1" />
        </aside>

        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/85 px-5 py-3.5 backdrop-blur-xl lg:hidden">
          <Logo />
          <button onClick={logout} className="grid size-9 place-items-center rounded-lg text-ink-mute hover:bg-paper-2" aria-label="Sign out">
            <LogOut className="size-4.5" />
          </button>
        </header>

        {banner && (
          <div className="flex items-center justify-between gap-3 bg-yellow px-5 py-2 text-sm font-semibold text-ink lg:px-10">
            <span className="truncate">{banner.text}</span>
            <button onClick={banner.onExit} className="inline-flex shrink-0 items-center gap-1 underline-offset-2 hover:underline">
              <ArrowLeft className="size-4" /> Back to admin
            </button>
          </div>
        )}

        <main className="mx-auto max-w-6xl px-5 pb-28 pt-6 sm:px-8 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cx('flex flex-col items-center gap-1 py-2.5 text-[0.68rem] font-semibold', active(href) ? 'text-ink' : 'text-ink-mute')}>
              <Icon className={cx('size-5', active(href) && 'stroke-[2.4]')} />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-ink-mute">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
