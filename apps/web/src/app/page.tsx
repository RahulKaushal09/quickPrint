import { ArrowDown, ArrowRight, Check, ChevronDown, CreditCard, FileText, Layers, MessageCircle, Monitor, PauseCircle, Printer, QrCode, RotateCcw, Smartphone, Wallet, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Logo, Mark } from '@/components/ui';
import { SITE_URL, WHATSAPP_DISPLAY, whatsappLink } from '@/lib/site';

const TITLE = 'SeedhaPrint: QR printing for print and photostat shops in India';
const DESCRIPTION = 'Put one QR at your counter. Customers upload from their phone, pay online, and the job prints on your own printer by itself. Works with your existing PC and printer, even Windows 7.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: '/', siteName: 'SeedhaPrint', title: TITLE, description: DESCRIPTION, locale: 'en_IN' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const COMPARE = [
  ['Customers send files to your personal WhatsApp', 'They upload themselves. Your WhatsApp stays yours.'],
  ['Pen drives bring viruses to your shop PC', 'No pen drive ever touches your computer.'],
  ['You count pages and work out the bill', 'Pages and price are worked out before they pay.'],
  ['You hunt for change and chase small payments', 'Every job is paid online before it prints.'],
  ['One busy person means a queue at the counter', 'Jobs print on their own while you serve others.'],
  ['Customer documents pile up on your PC', 'Files are deleted automatically after printing.'],
];

const FAQS = [
  ['Do I need to buy a new printer?', 'No. SeedhaPrint uses the printers already installed on your shop PC. You can send black & white jobs to one printer and colour jobs to another.'],
  ['My shop PC is old. Will it work?', 'It is built for Windows 7, 8, 10 and 11. You install one small program, type a pairing code, and it runs quietly in the background.'],
  ['Does my customer need to install an app?', 'No. They scan the QR with their phone camera and a web page opens. There is no app and no login.'],
  ['What can customers print?', 'PDFs and photos, on A4 paper, single-sided, in black & white or colour. You set your own price per page for each.'],
  ['What if the paper jams or a print comes out bad?', 'Every job has a pickup code and shows on your dashboard. Report the problem, then print it again or refund the customer.'],
  ['What happens if my internet or PC goes off?', 'New customers see that the printer is offline and payment pauses, so nobody pays for a print that cannot come out. Jobs already paid wait safely and print when your PC is back.'],
  ['Are customer documents safe?', 'Each file goes only to your shop, and files are deleted automatically after printing. Uploads that are never paid for are removed too.'],
  ['Where does the money go?', 'Straight to you. You connect your own Razorpay account, customers pay into it, and Razorpay settles to your bank. SeedhaPrint never holds your money.'],
  ['How much does it cost?', 'Send us a message on WhatsApp with your city and what you print. We will explain the plan for your shop.'],
];

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'SeedhaPrint',
      url: SITE_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Windows 7, Windows 8, Windows 10, Windows 11, Web',
      description: DESCRIPTION,
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ],
};

function WhatsAppButton({ children, large, className = '' }: { children: React.ReactNode; large?: boolean; className?: string }) {
  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2.5 rounded-2xl bg-wa font-bold text-white shadow-[0_10px_24px_-10px_rgb(14_138_90/0.8)] transition hover:bg-wa-dark active:scale-[0.98] ${large ? 'h-15 px-8 text-[1.06rem]' : 'h-13 px-6'} ${className}`}
    >
      <MessageCircle className="size-5" strokeWidth={2.4} />
      {children}
    </a>
  );
}

/** Printer's crop marks: the page's signature detail. */
function CropMarks({ className = '' }: { className?: string }) {
  const corner = 'absolute size-5 border-ink/25';
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden>
      <span className={`${corner} left-0 top-0 border-l border-t`} />
      <span className={`${corner} right-0 top-0 border-r border-t`} />
      <span className={`${corner} bottom-0 left-0 border-b border-l`} />
      <span className={`${corner} bottom-0 right-0 border-b border-r`} />
    </div>
  );
}

function Eyebrow({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p className={`flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.18em] ${light ? 'text-white/55' : 'text-ink-mute'}`}>
      <span className="cmyk-bar h-1.5 w-7 rounded-full" />
      {children}
    </p>
  );
}

export default async function Home() {
  const qr = await QRCode.toString(SITE_URL, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#0b1220', light: '#ffffff' } });

  return (
    <div className="overflow-x-clip pb-20 sm:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="SeedhaPrint home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-ink-soft md:flex">
            <a href="#how" className="transition hover:text-ink">How it works</a>
            <a href="#why" className="transition hover:text-ink">Why switch</a>
            <a href="#dashboard" className="transition hover:text-ink">Dashboard</a>
            <a href="#questions" className="transition hover:text-ink">Questions</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-paper-2 hover:text-ink">
              Shop login
            </Link>
            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-2 sm:inline-flex">
              <MessageCircle className="size-4" /> Talk to us
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="paper-grid absolute inset-0 [mask-image:radial-gradient(ellipse_90%_80%_at_50%_0%,black_35%,transparent_80%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[1.08fr_1fr] lg:gap-10 lg:pb-28 lg:pt-20">
            <div className="animate-rise">
              <Eyebrow>For print &amp; photostat shops</Eyebrow>
              <h1 className="mt-6 text-[3.4rem] font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-7xl lg:text-[5.4rem]">
                Phone se
                <br />
                seedha print.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-soft sm:text-xl">
                Put one QR at your counter. Customers upload their file, pay online, and it prints on your own printer by itself. You just hand it over.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <WhatsAppButton large>Get it for your shop</WhatsAppButton>
                <a href="#how" className="inline-flex h-15 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface px-7 font-bold transition hover:border-ink-mute">
                  See how it works <ArrowDown className="size-4" />
                </a>
              </div>
              <ul className="mt-9 grid gap-x-6 gap-y-2.5 text-sm font-medium text-ink-soft sm:flex sm:flex-wrap">
                {['Your existing printer', 'Windows 7 to 11', 'No app for customers'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-4 text-ok" strokeWidth={3} /> {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Counter scene: QR poster, customer's phone, finished job */}
            <div className="relative mx-auto h-[540px] w-full max-w-[420px] animate-rise [animation-delay:120ms] sm:h-[660px]" aria-hidden>
              <div className="absolute left-0 top-4 w-[58%] -rotate-[5deg] bg-white p-5 shadow-lift ring-1 ring-line">
                <CropMarks className="-m-1.5" />
                <div className="cmyk-bar -mx-5 -mt-5 mb-4 h-1.5" />
                <p className="text-center text-[1.35rem] font-extrabold leading-[1.05] tracking-tight">
                  Print from
                  <br />
                  your phone
                </p>
                <div className="mt-4 rounded-xl border-2 border-ink p-2.5 [&_svg]:block [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
                <p className="mt-3 text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-ink-mute">Scan · Upload · Collect</p>
              </div>

              <div className="absolute bottom-0 right-0 w-[56%] rounded-[2.2rem] border-[8px] border-ink bg-paper p-3 shadow-[0_40px_70px_-28px_rgb(11_18_32/0.55)]">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />
                <div className="flex items-center gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-[0.62rem] font-bold text-white">SP</span>
                  <div className="min-w-0">
                    <p className="truncate text-[0.72rem] font-bold">Sharma Photostat</p>
                    <p className="text-[0.58rem] font-semibold text-ok">● Printer ready</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface p-2">
                  <FileText className="size-4 shrink-0 text-ink-soft" />
                  <div className="min-w-0">
                    <p className="truncate text-[0.66rem] font-semibold">Assignment.pdf</p>
                    <p className="text-[0.56rem] font-semibold text-ok">12 pages</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <div className="rounded-lg border-2 border-ink bg-surface p-1.5">
                    <p className="text-[0.6rem] font-bold">B/W</p>
                    <p className="text-[0.55rem] text-ink-mute">₹2 / page</p>
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-1.5">
                    <p className="text-[0.6rem] font-bold">Colour</p>
                    <p className="text-[0.55rem] text-ink-mute">₹10 / page</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-surface px-2 py-1.5 text-[0.62rem]">
                  <span className="text-ink-mute">2 copies</span>
                  <span className="font-mono font-bold">₹48</span>
                </div>
                <div className="mt-2 rounded-xl bg-ink py-2.5 text-center text-[0.68rem] font-bold text-white">Pay ₹48 &amp; print</div>
              </div>

              <div className="absolute bottom-10 left-1 flex items-center gap-2.5 rounded-2xl bg-white py-2.5 pl-2.5 pr-4 shadow-lift ring-1 ring-line sm:left-3">
                <span className="grid size-9 place-items-center rounded-full bg-ok text-white">
                  <Check className="size-5" strokeWidth={3} />
                </span>
                <div>
                  <p className="text-[0.62rem] font-semibold text-ink-mute">Ready to collect</p>
                  <p className="font-mono text-lg font-bold leading-none tracking-[0.1em]">4821</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl">Three steps for the customer. One for you.</h2>
            <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-4">
              {[
                { icon: QrCode, who: 'Customer', t: 'Scans your QR', d: 'Any phone camera opens your shop page. No app, no login.' },
                { icon: Smartphone, who: 'Customer', t: 'Uploads and chooses', d: 'A PDF or photo, colour or black & white, and how many copies.' },
                { icon: CreditCard, who: 'Customer', t: 'Pays online', d: 'The price shows up first, then they pay. No change, no credit.' },
                { icon: Printer, who: 'You', t: 'Hand it over', d: 'It has already printed. Match the 4-digit pickup code and you are done.', you: true },
              ].map(({ icon: Icon, who, t, d, you }, i) => (
                <li key={t} className={`relative flex flex-col p-7 ${you ? 'bg-ink text-white' : 'bg-surface'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`grid size-11 place-items-center rounded-xl ${you ? 'bg-white text-ink' : 'bg-paper-2 text-ink'}`}>
                      <Icon className="size-5" />
                    </span>
                    <span className={`font-mono text-sm ${you ? 'text-white/50' : 'text-ink-mute'}`}>0{i + 1}</span>
                  </div>
                  <p className={`mt-10 text-xs font-bold uppercase tracking-[0.14em] ${you ? 'text-yellow' : 'text-ink-mute'}`}>{who}</p>
                  <h3 className="mt-1.5 text-xl font-extrabold tracking-tight">{t}</h3>
                  <p className={`mt-2 text-[0.95rem] leading-relaxed ${you ? 'text-white/65' : 'text-ink-soft'}`}>{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Why switch */}
        <section id="why" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <Eyebrow>Why shops switch</Eyebrow>
              <h2 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl">Your counter, without the running around.</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">A one-page print takes a lot of small work: the file, the page count, the bill, the change. SeedhaPrint takes that off your hands, so you can serve more people.</p>
            </div>
            <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
              <div className="grid grid-cols-2 border-b border-line text-xs font-bold uppercase tracking-[0.14em]">
                <p className="px-4 py-4 text-ink-mute sm:px-7">Today</p>
                <p className="border-l border-line bg-ok-soft px-4 py-4 text-ok sm:px-7">With SeedhaPrint</p>
              </div>
              <ul className="divide-y divide-line">
                {COMPARE.map(([before, after]) => (
                  <li key={before} className="grid grid-cols-2 text-sm sm:text-[0.95rem]">
                    <p className="flex gap-2 px-4 py-5 text-ink-soft sm:gap-2.5 sm:px-7">
                      <X className="mt-0.5 size-4 shrink-0 text-bad" strokeWidth={2.6} /> {before}
                    </p>
                    <p className="flex gap-2 border-l border-line bg-ok-soft/40 px-4 py-5 font-semibold sm:gap-2.5 sm:px-7">
                      <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={3} /> {after}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Dashboard */}
        <section id="dashboard" className="relative overflow-hidden bg-ink text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:py-28">
            <div>
              <Eyebrow light>Your dashboard</Eyebrow>
              <h2 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl">Know what your counter did today.</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-white/60">Every job and every rupee, on your phone or your PC, updating live.</p>
              <ul className="mt-9 grid gap-5 sm:grid-cols-2">
                {[
                  { icon: Wallet, t: 'Your prices, your earnings', d: 'Set your own rate per page. See today’s money at a glance.' },
                  { icon: Layers, t: 'B/W and colour routing', d: 'Assign one or more printers to each type. Jobs find the free one.' },
                  { icon: RotateCcw, t: 'Reprint or refund', d: 'Paper jam? Print it again, or give the money back.' },
                  { icon: PauseCircle, t: 'Pause any time', d: 'One switch stops new orders when you are closing up.' },
                ].map(({ icon: Icon, t, d }) => (
                  <li key={t}>
                    <Icon className="size-5 text-white/70" />
                    <p className="mt-3 font-bold">{t}</p>
                    <p className="mt-1 text-sm leading-relaxed text-white/55">{d}</p>
                  </li>
                ))}
              </ul>
            </div>

            <figure className="min-w-0">
              <div className="rounded-3xl bg-paper p-4 text-ink shadow-[0_40px_90px_-30px_rgb(0_0_0/0.8)] sm:p-5" aria-hidden>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-extrabold tracking-tight">Good morning, Rakesh</p>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-[0.68rem] font-bold text-ok">
                    <span className="size-1.5 rounded-full bg-ok" /> Printing is live
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ['Earnings', '₹1,240'],
                    ['Jobs', '38'],
                    ['Pages', '412'],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-line bg-surface p-3">
                      <p className="text-[0.65rem] font-semibold text-ink-mute">{l}</p>
                      <p className="mt-0.5 font-mono text-lg font-bold">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface px-3">
                  {[
                    ['4821', 'Assignment.pdf', '12 pages × 2 · B/W', '₹48', 'Printed', 'bg-ok-soft text-ok'],
                    ['7306', 'Photo.jpg', '1 page × 2 · Colour', '₹20', 'Printing', 'bg-cyan-soft text-[#00739e]'],
                    ['2594', 'Resume.pdf', '2 pages × 5 · B/W', '₹20', 'Printing', 'bg-cyan-soft text-[#00739e]'],
                  ].map(([code, file, meta, price, status, tone]) => (
                    <div key={code} className="flex items-center gap-3 py-2.5">
                      <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-paper-2 font-mono text-sm font-bold">{code}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{file}</p>
                        <p className="truncate text-[0.65rem] text-ink-mute">{meta}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xs font-bold">{price}</p>
                        <span className={`mt-0.5 inline-block rounded-full px-1.5 py-px text-[0.58rem] font-bold ${tone}`}>{status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <figcaption className="mt-3 text-center text-xs text-white/40">Sample screen. The numbers are only an example.</figcaption>
            </figure>
          </div>
          <div className="cmyk-bar h-1.5" />
        </section>

        {/* What you need */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="grid gap-5 lg:grid-cols-3">
            <div>
              <Eyebrow>Getting started</Eyebrow>
              <h2 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-[-0.03em]">You already have what you need.</h2>
            </div>
            {[
              { icon: Monitor, t: 'A Windows PC', d: 'Windows 7, 8, 10 or 11, with internet. Old computers are welcome.' },
              { icon: Printer, t: 'Your printer', d: 'Any printer already installed and working on that PC.' },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-3xl border border-line bg-surface p-7 shadow-card">
                <Icon className="size-6 text-ink-soft" />
                <h3 className="mt-8 text-xl font-extrabold tracking-tight">{t}</h3>
                <p className="mt-1.5 text-ink-soft">{d}</p>
              </div>
            ))}
          </div>
          <ol className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Message us', 'Tell us your shop name and city on WhatsApp.'],
              ['We add your shop', 'You get your login and QR code, and connect your Razorpay.'],
              ['Install on your PC', 'Run the small installer and type your pairing code.'],
              ['Put up your poster', 'Print it from your dashboard and stick it at the counter.'],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-3xl bg-paper-2 p-6">
                <span className="grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-5 font-extrabold tracking-tight">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section id="questions" className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
            <div>
              <Eyebrow>Questions</Eyebrow>
              <h2 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl">What shop owners ask first.</h2>
              <p className="mt-5 text-ink-soft">Something else on your mind? Ask us directly on WhatsApp.</p>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {FAQS.map(([q, a]) => (
                <details key={q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[1.05rem] font-bold [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown className="size-5 shrink-0 text-ink-mute transition group-open:rotate-180" />
                  </summary>
                  <p className="pb-5 pr-8 leading-relaxed text-ink-soft">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-5 py-16 sm:px-8 lg:py-24">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-white px-6 py-16 text-center shadow-lift ring-1 ring-line sm:px-12 lg:py-24">
            <CropMarks className="m-4" />
            <Mark size={52} className="mx-auto" />
            <h2 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.03] tracking-[-0.03em] sm:text-6xl">Let your counter print by itself.</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-ink-soft">Send us a message with your shop name and city. We will show you how it works for your shop.</p>
            <WhatsAppButton large className="mt-9">
              Message us on WhatsApp <ArrowRight className="size-5" />
            </WhatsAppButton>
            <p className="mt-4 font-mono text-sm text-ink-mute">{WHATSAPP_DISPLAY}</p>
          </div>
        </section>
      </main>

      <footer className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 px-5 py-12 sm:flex-row sm:items-center sm:px-8">
          <div>
            <Logo light />
            <p className="mt-2 text-sm text-white/50">Phone se seedha print.</p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-white/65 sm:items-end">
            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="transition hover:text-white">
              WhatsApp {WHATSAPP_DISPLAY}
            </a>
            <Link href="/login" className="transition hover:text-white">
              Shop login
            </Link>
          </div>
        </div>
        <div className="cmyk-bar h-1.5" />
      </footer>

      {/* Always-available contact on phones */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 p-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-xl sm:hidden">
        <WhatsAppButton className="w-full">Talk to us on WhatsApp</WhatsAppButton>
      </div>
    </div>
  );
}
