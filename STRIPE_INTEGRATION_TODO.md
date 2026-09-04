# Stripe integration – remaining steps

RentFlow uses **Hosted Stripe Checkout** in two places, both in [src/lib/stripe.ts](src/lib/stripe.ts):

1. `createRentalCheckout` – a customer pays a rental balance. `mode: "payment"`, created as a **direct charge on the rental business's connected account** with a platform `application_fee_amount`.
2. `createSubscriptionCheckout` – a rental business subscribes to a RentFlow plan. `mode: "subscription"`, billed to the business's v2 Account via `customer_account`.

## Values to Replace

None of the `sample_only` parameters are placeholders: `mode`, `success_url`, `cancel_url` and `line_items` already use real values derived at runtime (order amounts, plan Price IDs from `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO`, and `APP_URL`).

**Files containing these parameters:**
- [src/lib/stripe.ts](src/lib/stripe.ts)

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| mode | `payment` (rental) / `subscription` (plan) | Already correct for each flow. |
| success_url | `${APP_URL}/s/<slug>/orders/<id>?paid=1&session_id={CHECKOUT_SESSION_ID}` / `${APP_URL}/billing?success=1` | Set `APP_URL` to your public domain (Vercel: `https://rentflow-boys-from310.vercel.app`). |
| cancel_url | `${APP_URL}/s/<slug>/orders/<id>?cancelled=1` / `${APP_URL}/billing` | Same as above. |
| line_items[].price | `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` (subscription) / inline `price_data` (rental) | Create with `npm run stripe:setup`; set the env vars in Vercel. |

## Configured Parameters

These parameters were configured in Checkout Studio and are set on **both** Checkout Session calls.

**Files containing these parameters:**
- [src/lib/stripe.ts](src/lib/stripe.ts)

| Parameter | Value |
|-----------|-------|
| ui_mode | `hosted_page` (Stripe Node SDK 22.6.1 ≥ 21.0.0) |
| billing_address_collection | `auto` |
| phone_number_collection | `{ enabled: false }` |
| automatic_tax | `{ enabled: false }` |
| allow_promotion_codes | `false` |
| payment_method_collection | `always` (subscription mode only) |
| submit_type | `auto` |
| integration_identifier | `hosted_web_0001` |
| origin_context | `web` |

Parameters kept because the app depends on them (they are not Checkout Studio settings): `customer_email`, `metadata`, `payment_intent_data.application_fee_amount`, `customer_account`, `subscription_data`, and the `stripeAccount` request option.

## Setup

Environment variables (`.env` locally; **Sensitive** environment variables on Vercel):

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server-side key. Prefer a restricted key (`rk_…`) with write access to Accounts v2, Checkout Sessions, Subscriptions, Customer Portal, Refunds, Products, Prices, Webhook Endpoints. |
| `STRIPE_PUBLISHABLE_KEY` | Not used by the hosted flow today; reserved for Stripe.js. |
| `STRIPE_WEBHOOK_SECRET` | Platform endpoint `/api/webhooks/stripe` (subscription lifecycle). |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect endpoint `/api/webhooks/stripe/connect` (rental payments, account status). |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` | Recurring Price IDs for the plans. |
| `PLATFORM_FEE_PERCENT` | Platform fee kept from each rental payment (default 5). |
| `APP_URL` | Public base URL used in success/cancel/return URLs. |

Commands:

```bash
npm run stripe:setup                                  # products, prices, portal config (idempotent)
npm run stripe:setup -- --webhooks https://your-app   # also creates both webhook endpoints, prints secrets
npm run stripe:listen                                 # local webhook forwarding via Stripe CLI
```

**One-time Dashboard step still required:** complete Connect platform setup for the account/sandbox
(https://dashboard.stripe.com/settings/connect/platform-setup). Until then Stripe rejects Accounts v2 calls, so businesses can't connect and subscription Checkout (which bills a v2 Account) can't start.

## Project structure

| File | Role |
|---|---|
| `src/lib/stripe.ts` | Stripe client, plans, Connect account creation/onboarding/status, both Checkout Session calls, portal, refunds |
| `src/lib/payments.ts` | Starts a payment for an order (Stripe, unavailable, or demo simulated page) and marks payments paid/failed |
| `src/lib/stripe-webhooks.ts` | Event handlers with idempotency (`StripeEvent` table) |
| `src/app/api/webhooks/stripe/route.ts` | Platform webhook (signature verified) |
| `src/app/api/webhooks/stripe/connect/route.ts` | Connect webhook (signature verified) |
| `src/app/dashboard/payouts/page.tsx` | "Get paid" page: connect with Stripe, onboarding status |
| `src/app/billing/page.tsx`, `actions.ts` | Plan selection, subscription Checkout, Customer Portal |
| `scripts/stripe-setup.ts` | Creates products, prices, portal configuration, webhook endpoints |
| `scripts/check-secrets.sh` | Pre-commit hook blocking committed Stripe keys |

## How it works

**Rental payment:** storefront checkout → order + pending Payment row → Checkout Session on the business's connected account (`stripeAccount` header) with `application_fee_amount` → customer pays on Stripe → Connect webhook `checkout.session.completed` / `async_payment_succeeded` (gated on `payment_status !== "unpaid"`) marks the payment paid and confirms the order. The success page only speeds up the display; the webhook is the source of truth. Refunds call `refunds.create` on the connected account with `refund_application_fee: true`.

**Subscription:** business picks a plan → subscription Checkout Session billed to its v2 Account (`customer_account`) with any remaining trial days → platform webhook `customer.subscription.*` / `invoice.*` events update `subscriptionStatus`, `planKey`, `currentPeriodEnd` → dashboard gating uses that state. Self-service changes go through the Customer Portal.

## Testing

Test mode cards:

| Card | Result |
|---|---|
| 4242 4242 4242 4242 | Succeeds |
| 4000 0025 0000 3155 | Requires 3D Secure authentication |
| 4000 0000 0000 9995 | Declined (insufficient funds) |

Any future expiry, any CVC and postal code. Use `npm run stripe:listen` for local webhooks; the sandbox Dashboard shows sessions tagged `hosted_web_0001` under Checkout.

## Next steps

- Complete Connect platform setup (see above), then onboard the demo business from **Dashboard → Get paid** using Stripe's test onboarding data.
- Enable Stripe Tax and add tax registrations before switching `automatic_tax` to `enabled: true`; without a registration Stripe collects no tax.
- Go-live: swap to live keys stored as Sensitive variables, recreate live webhook endpoints with `npm run stripe:setup -- --webhooks <live url>`, and review https://docs.stripe.com/get-started/checklist/go-live.
- Optional: add the Connect embedded components (`notification_banner`, `account_management`, `payments`) to the "Get paid" page.

## Resources

- https://support.stripe.com
- https://docs.stripe.com/mcp
- https://docs.stripe.com/payments/checkout
- https://docs.stripe.com/connect/direct-charges
