import { ArrowRight, BadgeIndianRupee, Clock3, MonitorCheck, QrCode, ShieldCheck, Smartphone, Upload, Zap } from 'lucide-react';
import Link from 'next/link';
import { Logo, Mark } from '@/components/ui';

export default function Home() {
  return (
    <div className="overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-soft transition hover:bg-paper-2 hover:text-ink">
          Shop login
        </Link>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="paper-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-soft shadow-card">
              <span className="cmyk-bar h-2 w-6 rounded-full" /> For neighbourhood print shops
            </span>
            <h1 className="mt-6 text-[2.7rem] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
              The print counter
              <br />
              that runs itself.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-ink-soft">
              Customers scan your QR, upload a PDF or photo, pick colour or black &amp; white and pay by UPI. The job prints on your printer by itself. You just hand it over.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/s/DEMO42" className="inline-flex h-13 items-center gap-2 rounded-2xl bg-ink px-6 font-semibold text-white shadow-lift transition hover:bg-ink-2">
                Try the customer view <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className="inline-flex h-13 items-center rounded-2xl border border-line-strong bg-surface px-6 font-semibold transition hover:border-ink-mute">
                Shop owner login
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-mute">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4" /> Files auto-deleted</span>
              <span className="inline-flex items-center gap-1.5"><MonitorCheck className="size-4" /> Windows 7, 10 &amp; 11</span>
              <span className="inline-flex items-center gap-1.5"><BadgeIndianRupee className="size-4" /> UPI via Razorpay</span>
            </div>
          </div>

          {/* Phone mock */}
          <div className="relative mx-auto w-full max-w-[320px] animate-rise [animation-delay:120ms]">
            <div className="absolute -left-16 -top-10 opacity-90">
              <Mark size={180} />
            </div>
            <div className="relative rounded-[2.6rem] border-[10px] border-ink bg-paper p-4 shadow-[0_40px_80px_-30px_rgb(11_18_32/0.45)]">
              <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-ink/15" />
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-ink text-sm font-bold text-white">SP</div>
                <div className="flex-1">
                  <p className="text-sm font-bold">Sharma Photostat</p>
                  <p className="text-[0.7rem] text-ink-mute">Sector 17, Chandigarh</p>
                </div>
                <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[0.65rem] font-bold text-ok">● Ready</span>
              </div>
              <div className="mt-4 rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-9 rounded-md border border-line bg-paper" />
                  <div>
                    <p className="text-xs font-semibold">Assignment_final.pdf</p>
                    <p className="text-[0.68rem] text-ok">✓ 12 pages</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border-2 border-ink bg-surface p-2.5">
                  <p className="text-xs font-bold">Black &amp; white</p>
                  <p className="text-[0.68rem] text-ink-mute">₹2 / page</p>
                </div>
                <div className="rounded-xl border border-line bg-surface p-2.5">
                  <p className="text-xs font-bold">Colour</p>
                  <p className="text-[0.68rem] text-ink-mute">₹10 / page</p>
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-surface p-3">
                <div className="cmyk-bar -mx-3 -mt-3 mb-3 h-1 rounded-t-xl" />
                <div className="flex justify-between text-xs"><span className="text-ink-mute">12 pages × 2 copies</span><span className="font-semibold">24 prints</span></div>
                <div className="mt-2 flex justify-between border-t border-dashed border-line pt-2 text-sm font-bold"><span>Total</span><span className="font-mono">₹48</span></div>
              </div>
              <div className="mt-4 rounded-2xl bg-ink py-3.5 text-center text-sm font-semibold text-white">Pay ₹48 &amp; print →</div>
            </div>
          </div>
        </div>
      </section>

      {/* How */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-mute">How it works</p>
          <h2 className="mt-2 max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">Three steps for the customer. Zero for you.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { icon: QrCode, color: 'bg-cyan-soft text-[#00739e]', t: 'Scan the QR', d: 'Any phone camera opens your shop page. No app, no login, no WhatsApp forwarding.' },
              { icon: Upload, color: 'bg-magenta-soft text-magenta', t: 'Upload & pay', d: 'PDF or photo, colour or B/W, number of copies. The price is shown before paying by UPI or card.' },
              { icon: Zap, color: 'bg-yellow-soft text-warn', t: 'It prints', d: 'Your shop PC receives the paid job and prints it right away. The customer shows a 4-digit code to collect.' },
            ].map(({ icon: Icon, color, t, d }, i) => (
              <div key={t} className="rounded-3xl border border-line bg-paper p-7">
                <div className="flex items-center justify-between">
                  <span className={`grid size-12 place-items-center rounded-2xl ${color}`}>
                    <Icon className="size-6" />
                  </span>
                  <span className="font-mono text-sm text-ink-mute">0{i + 1}</span>
                </div>
                <h3 className="mt-6 text-xl font-bold">{t}</h3>
                <p className="mt-2 text-ink-soft">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Built for a busy counter.</h2>
            <p className="mt-4 max-w-md text-lg text-ink-soft">Small shops lose time collecting files, counting pages and chasing change. QuickPrint takes all of that off the counter.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Clock3, t: 'No queue at the counter', d: 'Customers order while they walk in.' },
              { icon: BadgeIndianRupee, t: 'Paid before it prints', d: 'No credit, no change, no disputes.' },
              { icon: Smartphone, t: 'Live job dashboard', d: "Today's jobs, earnings and issues on your phone." },
              { icon: MonitorCheck, t: 'Works on old PCs', d: 'One small installer, even on Windows 7.' },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                <Icon className="size-5 text-ink-soft" />
                <p className="mt-3 font-bold">{t}</p>
                <p className="mt-1 text-sm text-ink-mute">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-12 sm:flex-row sm:items-center sm:px-8">
          <div>
            <Logo light />
            <p className="mt-2 text-sm text-white/50">Scan. Upload. Pick up.</p>
          </div>
          <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink">
            Shop owner login <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="cmyk-bar h-1.5" />
      </footer>
    </div>
  );
}
