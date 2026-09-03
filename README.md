# RentFlow

A multi-tenant platform where any rental business can sign up and get its own booking website, backed by a dashboard that runs the business:

| Area | What you get |
|---|---|
| **Storefront** | Branded site at `/s/<your-slug>` with date-based availability, instant quotes, online booking and a chat assistant. |
| **Orders** | Pending → Confirmed → Out on rental → Returned pipeline, manual orders, internal notes, overdue tracking. |
| **Payments** | Stripe Checkout for cards (webhook + redirect reconciliation), manual cash/card/bank payments, refunds, outstanding balances. Falls back to a simulated checkout when Stripe isn't configured. |
| **Inventory** | Items with units, day rates, deposits, minimum days and categories. Availability is computed from live bookings so you can't double-book. Low-stock alerts. |
| **AI reminder agent** | Scans open orders and drafts pickup, return, overdue and payment reminders written by Claude (templates without a key). Approve & send from the dashboard or enable auto-send. Runs on a timer, via cron endpoint, or from the CLI. |
| **AI support bot** | Claude-powered chat widget with tools to list inventory, check availability and price, look up an order, create a booking, and escalate to a human. Rule-based fallback in demo mode. |

## Quick start

```bash
npm install
cp .env.example .env      # optional: add ANTHROPIC_API_KEY, Stripe, SMTP
npm run setup             # creates the SQLite database and seeds a demo business
npm run dev
```

Open http://localhost:3000.

- Demo dashboard: sign in with `demo@rentflow.app` / `demo1234`
- Demo storefront: http://localhost:3000/s/peak-gear

Create your own business at `/signup` – it walks you through naming your storefront.

## Configuration

Everything except `DATABASE_URL` is optional. See `.env.example`.

| Variable | Effect when set |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude for the support bot (tool use) and for writing reminder emails. Model via `CLAUDE_MODEL` (default `claude-opus-5`). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Real card payments through Stripe Checkout. Point the webhook at `/api/webhooks/stripe`. |
| `SMTP_HOST` … | Reminders are emailed. Otherwise they're stored in the outbox and marked sent. |
| `REMINDER_AGENT_INTERVAL_MINUTES` | Runs the reminder agent inside the dev/prod Node server on a timer. |
| `CRON_SECRET` | Protects `GET/POST /api/cron/reminders` for external schedulers. |

Run the agent manually at any time:

```bash
npm run agent:run
# or
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

## Project layout

```
prisma/schema.prisma        Data model (users, businesses, items, orders, payments, reminders, conversations)
prisma/seed.ts              Demo business with inventory, orders and payments
src/lib/                    Domain logic: auth, orders & availability, payments, Stripe, mailer,
                            reminders (agent), bot (Claude tool use)
src/app/dashboard/          Owner dashboard (server components + server actions)
src/app/s/[slug]/           Public storefront, order page, simulated payment page
src/app/api/storefront/     Availability, checkout and chat endpoints used by the storefront
src/app/api/webhooks/stripe Stripe webhook
src/app/api/cron/reminders  Scheduler entry point
src/instrumentation.ts      In-process timer for the reminder agent
```

## Going to production

- Switch Prisma's datasource to Postgres (`provider = "postgresql"`) and set `DATABASE_URL`; run `npx prisma db push`.
- Set `APP_URL` to your public URL (used in Stripe redirects).
- Configure a scheduler to hit `/api/cron/reminders` (e.g. Vercel Cron every 30 minutes).
- Put the app behind your own domain; storefronts are path-based (`/s/<slug>`) so a single deployment serves every tenant.
