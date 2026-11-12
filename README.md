# SeedhaPrint

QR self-service printing for small print shops. A customer scans the shop's QR, uploads a PDF or photo, picks black & white or colour and the number of copies, pays online, and the job prints on that shop's printer automatically. The customer collects it with a 4-digit pickup code.

```
Customer phone ──▶ Web (Next.js) ──▶ API (Express + MongoDB) ◀══ WebSocket ══▶ Shop PC agent ──▶ Printer
                                         │
                                         └── Each shop's own Razorpay (orders, webhook, refunds)
```

## What's inside

```
SeedhaPrint/
├── packages/shared   Job states, pricing, agent protocol (used by API and web)
├── apps/api          Express 5 + Mongoose: public, shop, admin, agent routes + WebSocket hub
├── apps/web          Next.js 16 + Tailwind 4: customer QR flow, shop dashboard, admin, home page
├── apps/agent        Go 1.20 print agent
└── apps/desktop      The Windows app (Electron 22 + agent) and its installer (Windows 7, 8, 10, 11)
```

| Who | Where | What they do |
|---|---|---|
| Customer | `/s/<CODE>` (the QR) | Upload a PDF or many photos, tick and turn pages, choose B/W or colour, one or both sides, copies, pay online or cash |
| Customer | `/j/<ref>` | Live status + pickup code |
| Shop owner | `/dashboard` | Today's earnings, jobs, printers per print type, own Razorpay, pairing, QR poster, prices, pause orders |
| Platform admin | `/admin` | Add shops (gets QR + owner login), see who has connected Razorpay, enable or disable, "view as shop" |

## Run it locally

Needs Node 22.9+ and MongoDB.

```bash
npm install
cp apps/api/.env.example apps/api/.env          # MONGO_URI is the only thing you must check
cp apps/web/.env.example apps/web/.env.local
npm run seed                                     # admin 9999999999/admin123, shop owner 9000000001/shop123
npm run dev:api                                  # http://localhost:4100
npm run dev:web                                  # http://localhost:3100
npm run agent:dev                                # fake shop PC with two simulated printers (needs a pairing code first, see below)
```

Pair the simulated PC: sign in as the shop owner, open **Printers → Add shop PC**, then:

```bash
cd apps/agent && ../../.toolchain/go/bin/go run . --dev pair <CODE> http://localhost:4100
```

Open `http://localhost:3100/s/DEMO42` on your phone or browser. With no Razorpay keys, payment is a clearly labelled **test checkout**. "Printed" files land in `apps/agent/dev-data/outbox/<printer>/`.

Ports 3100/4100 are used so it doesn't clash with other local projects on 3000/4000.

## The Windows app

`SeedhaPrint-Setup.exe` is the one thing a shop installs. It opens by itself when Windows starts and holds everything: the owner's dashboard in its own window, and the print agent running behind it. Closing the window keeps it printing from the tray.

```bash
npm install --prefix apps/desktop --ignore-scripts
npm run app:build -- --version 1.0.0
```

This builds on macOS or Linux, no Wine needed, and fetches Go 1.20, Electron 22, `rsrc` and SumatraPDF into `.toolchain/`. It needs `makensis` (`brew install makensis`). Addresses default to `seedhaprint.in`; pass `--web` and `--api` to change them.

The installer is about 70 MB, too big for git, so copy it to the server **before** the web restart:

```
apps/web/public/downloads/SeedhaPrint-Setup.exe
```

To run the app on a Mac while developing, the Electron binary must be in place first (`node apps/desktop/node_modules/electron/install.js`, or unzip it into `dist` and write `path.txt`):

```bash
cd apps/desktop && SEEDHAPRINT_WEB_URL=http://localhost:3100 SEEDHAPRINT_AGENT=/path/to/agent node_modules/.bin/electron . --dev
```

Why it runs on Windows 7 as well as 10/11:

- **Electron 22** is the last Electron that supports Windows 7, 8 and 8.1. It gets no more security fixes, so the app opens only SeedhaPrint's own pages and sends every other link to the normal browser. Don't upgrade it while Windows 7 shops are supported.
- **Go 1.20, windows/386** for the agent. Go 1.20 is the last Go that supports Windows 7, and a 32-bit exe runs on both 32 and 64-bit Windows. Don't raise the Go version in `go.mod`.
- **Printers from the Windows spooler API** (`winspool.drv`), not PowerShell or WMI, including whether a printer can print both sides.
- **Own CA bundle** (`apps/agent/certs/roots.pem`) because un-updated Windows 7 PCs don't trust Let's Encrypt.
- **SumatraPDF 3.4.6 (32-bit)** for silent printing.

The agent keeps a WebSocket to the API, reconnects with backoff, prints one job at a time, and remembers the last 500 finished jobs so a resent job is never printed twice. **Printers → Connect this PC** in the app pairs it in one click. Its status page is at `http://localhost:47210`.

## How it scales to thousands of shops

- **One database, one codebase, every row scoped by `shopId`.** Adding a shop is one admin form, not a deployment.
- **Agents connect to any API server.** Each server only talks to the PCs connected to it. A paid job is claimed with an atomic `queued → sent` update, so you can run several API servers behind a load balancer (with WebSocket support) against the same MongoDB, with no Redis. The server that took the payment dispatches immediately; every server also sweeps its own shops every 3 s.
- **At-least-once delivery, never printed twice.** Jobs a PC doesn't acknowledge within 45 s go back to the queue; jobs sent to a PC that disconnects before confirming are re-queued; the agent ignores IDs it already printed.
- **Shared file storage.** Set `S3_*` (AWS S3 or Cloudflare R2) before running more than one API server. Local disk is fine for one.
- **Files are deleted** 24 h after printing (configurable) and at once for unpaid drafts. Job records stay for accounting.
- Load is small: 1,000 shops × 200 jobs/day is about 2 to 3 jobs per second.

## Payments (each shop's own Razorpay)

Every shop connects its own Razorpay account, so customers pay the shop directly and SeedhaPrint never holds money. This also means SeedhaPrint can't take a cut of each job: charge shops a subscription.

1. Set `ENCRYPTION_KEY` in `apps/api/.env` once (`openssl rand -hex 32`). It encrypts shop secrets; if it changes, every shop must reconnect.
2. The shop opens **Dashboard → Payments** and pastes the Key ID and Key Secret from Razorpay (**Account & Settings → API Keys**). They are checked against Razorpay before saving.
3. The same page shows the shop's webhook URL and secret to add in Razorpay, with the events `payment.captured` and `order.paid`. The webhook marks a job paid even if the customer closes the browser.

- A job only prints after the server confirms the payment with the shop's account (signature + amount + order).
- Refunds from the dashboard use the shop's keys.
- Without keys, a shop's customers can't pay. `ALLOW_TEST_CHECKOUT=true` turns on a fake checkout for testing, and it prints for free, so keep it off in production. Razorpay test keys are the safer way to test a shop.
- A later upgrade: Razorpay's Technology Partner OAuth gives a one-click "Connect Razorpay", once Razorpay approves the platform as a partner.

## Trays and running out of paper

Each printer's trays come from Windows. On **Printers → Trays** the shop ticks the trays to use, in order, separately for documents and passport photos.

- A job starts on the first tray. The agent watches the Windows print queue: if the job stops on an empty tray (or another problem) for 25 seconds **before any page has printed**, it removes the job from the queue and tries the next tray, then reports it. The shop sees the note on the job.
- When every tray of that printer is empty, the job moves to another printer that can take it. With none left, it fails with the reason, and **Print again** after a refill prints it.
- If paper runs out **part way through**, the job stays in the queue and finishes after a refill. Sending it elsewhere would print those pages twice.
- Not every printer tells Windows when a tray is empty, and some cheap USB printers skip the queue entirely. Test each printer once with a tray empty.

## Passport photos

Off by default; the shop turns it on in **Settings → Passport photos** and picks the paper (4 × 6 inch or A4), the photo size (35 × 45 mm or 51 × 51 mm), how many go on a sheet and the price per sheet. On 4 × 6 paper, 6 photos fit upright and 8 fit turned sideways.

The customer takes or chooses one photo, drags and zooms it to fit the face in the frame, sees the whole sheet, and pays online or cash. The server crops it at 600 dpi and lays out the sheet with the same code as the preview (`packages/shared/src/photos.ts`). It prints at exact size (`noscale`) on the photo printers and photo trays the shop chose. For 4 × 6 paper, set that printer's paper size to 4 × 6 in Windows.

There is no background removal yet: customers should stand in front of a plain light wall.

## Subscriptions

Shops pay SeedhaPrint a monthly fee, set per shop in the admin panel. A fee of 0 means free, and every shop starts free until a fee is set, so adding this never switches anyone off.

| State | When | What happens |
|---|---|---|
| Free | Fee is 0 | Never switches off |
| Paid | More than 5 days left | Normal |
| Due soon | 5 days or less left | Yellow reminder in the shop's dashboard |
| Overdue | Past the paid-until date, within the grace days | Orange warning; customers can still order |
| Switched off | Past the grace days | Red banner for the shop; the QR page says the shop isn't taking orders. Jobs already paid still print |

- **Admin → Add shop** takes a monthly fee and free days before the first payment (default 14).
- **Admin → click a shop → Record a payment** adds 1, 3, 6 or 12 months: after the current end date if paid early, from today if it had already ended. The shop switches back on at once. Each payment is kept with its method and note (UTR).
- The paid-until date can be changed by hand to correct a mistake.
- Filters show Paid, Due soon, Overdue, Switched off and Free, with this month's subscription income.
- Grace days: `SUBSCRIPTION_GRACE_DAYS` in `apps/api/.env` (default 3).
- The state is worked out from the fee and date on every request (`apps/api/src/subscription.ts`), so nothing runs on a timer. Online payment by the shop itself is not built yet; owners get a WhatsApp renew button.

## Cash

Customers can choose cash when the shop allows it (**Settings → Accept cash**). The **Print cash orders directly** switch on the overview decides what happens next:

- **Off (default):** the order waits as "Collect cash". The shop taps **Cash received, print** or **Cancel**. Orders nobody accepted expire after 24 hours.
- **On:** it prints at once, before the money is collected. Fast, but anyone who scans the QR can print without paying.

## Deploying

- **API:** any Node host with WebSockets (a VPS with PM2, Railway, Render, Fly). `npm run start -w @seedhaprint/api`. Put it behind HTTPS at e.g. `https://api.seedhaprint.in`. Set `NODE_ENV=production`, a long `JWT_SECRET`, `WEB_URL`, `API_URL`, `MONGO_URI` (Atlas).
- **Web:** Vercel or any Node host. `npm run build -w @seedhaprint/web`. Set `NEXT_PUBLIC_API_URL=https://api.seedhaprint.in` and `NEXT_PUBLIC_SITE_URL=https://seedhaprint.in`, plus `NEXT_PUBLIC_WHATSAPP_NUMBER` if it changes.
- **Windows app:** build the installer and copy it to the server (see above). If the API address changes, rebuild it; installed PCs must then be connected again.
- **Addresses:** `WEB_URL` and `API_URL` (API `.env`), `NEXT_PUBLIC_*` (Vercel). No address is hardcoded in the code.
- **Word files (optional):** install LibreOffice on the API server and set `SOFFICE_PATH`; the customer page then accepts .doc/.docx automatically.

## Not done yet

- A real Razorpay account connected and paid through. The flow is tested against a stand-in for Razorpay's API.
- Hosting, and buying seedhaprint.in.
- Terms, Privacy, Refund and Contact pages, which Razorpay asks for before activating an account.
- The installer is unsigned, so Windows SmartScreen will warn ("More info → Run anyway") until you buy a code-signing certificate.
- The Windows app and real printing on Windows 7 and 10 are untested on real PCs. The app's logic and screens are tested on a Mac with the same Electron version, and the print flow with simulated printers.
- Paper sizes other than A4 are deliberately left out to keep the customer flow simple.
- Password reset is manual (admin).

## Tests

```bash
npm test                         # shared pricing/state rules + document conversion
cd apps/agent && ../../.toolchain/go/bin/go test ./...
npm run typecheck
```
