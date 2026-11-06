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
└── apps/agent        Go 1.20 Windows agent + NSIS installer (Windows 7, 8, 10, 11)
```

| Who | Where | What they do |
|---|---|---|
| Customer | `/s/<CODE>` (the QR) | Upload, choose B/W or colour and copies, pay |
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

## The Windows agent

`npm run agent:build -- --version 1.0.0` (points at `https://api.seedhaprint.in`; pass `--server` to use another address)

Produces `apps/agent/build/out/SeedhaPrintAgent-Setup.exe` and copies it to `apps/web/public/downloads/`, which is where the dashboard's **Download agent** button points. Run it on macOS or Linux; it fetches Go 1.20, `rsrc` and SumatraPDF into `.toolchain/` on first use. Needs `makensis` (`brew install makensis`).

Why it runs on Windows 7 as well as 10/11:

- **Go 1.20, windows/386.** Go 1.20 is the last Go that supports Windows 7, and a 32-bit exe runs on both 32 and 64-bit Windows. One file, no runtime to install. Don't raise the Go version in `go.mod`.
- **Printers from the Windows spooler API** (`winspool.drv`), not PowerShell or WMI, which differ or are missing on Windows 7.
- **Own CA bundle** (`apps/agent/certs/roots.pem`) because un-updated Windows 7 PCs don't trust Let's Encrypt.
- **SumatraPDF 3.4.6 (32-bit)** for silent printing; it supports Windows 7.
- The installer only uses `taskkill` and `icacls`, which exist on Windows 7.

What the agent does: pairs once with an 8-character code (one-time, 30-minute expiry), keeps a WebSocket to the API, reconnects with backoff, prints one job at a time with `copies`, `color/monochrome`, `fit`, `paper=A4`, and remembers the last 500 finished jobs so a resent job is never printed twice. It starts at Windows login (Startup folder) as the signed-in user, so it sees that user's printers. Status page: `http://localhost:47210` (also lets you re-pair).

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

## Deploying

- **API:** any Node host with WebSockets (a VPS with PM2, Railway, Render, Fly). `npm run start -w @seedhaprint/api`. Put it behind HTTPS at e.g. `https://api.seedhaprint.in`. Set `NODE_ENV=production`, a long `JWT_SECRET`, `WEB_URL`, `API_URL`, `MONGO_URI` (Atlas).
- **Web:** Vercel or any Node host. `npm run build -w @seedhaprint/web`. Set `NEXT_PUBLIC_API_URL=https://api.seedhaprint.in` and `NEXT_PUBLIC_SITE_URL=https://seedhaprint.in`, plus `NEXT_PUBLIC_WHATSAPP_NUMBER` if it changes.
- **Agent:** the installer in `apps/web/public/downloads/` is committed and already points at `https://api.seedhaprint.in`. If the API address changes, rebuild it and commit; installed PCs must then be paired again.
- **Addresses:** `WEB_URL` and `API_URL` (API `.env`), `NEXT_PUBLIC_*` (Vercel). No address is hardcoded in the code.
- **Word files (optional):** install LibreOffice on the API server and set `SOFFICE_PATH`; the customer page then accepts .doc/.docx automatically.

## Not done yet

- A real Razorpay account connected and paid through. The flow is tested against a stand-in for Razorpay's API.
- Hosting, and buying seedhaprint.in.
- Terms, Privacy, Refund and Contact pages, which Razorpay asks for before activating an account.
- The installer is unsigned, so Windows SmartScreen will warn ("More info → Run anyway") until you buy a code-signing certificate.
- Real printing on Windows 7 and Windows 10 hardware is untested. Everything up to SumatraPDF is tested (printer listing compiles against the Windows API, command lines are unit-tested, full flow runs with simulated printers).
- Duplex, page ranges, per-page rotation and paper sizes other than A4 are deliberately left out to keep the customer flow simple.
- Password reset is manual (admin).

## Tests

```bash
npm test                         # shared pricing/state rules + document conversion
cd apps/agent && ../../.toolchain/go/bin/go test ./...
npm run typecheck
```
