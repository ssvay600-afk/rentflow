import Stripe from "stripe";
import type { Business } from "@prisma/client";
import { prisma } from "./db";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let cached: Stripe | null | undefined;

/** Stripe client, or null when STRIPE_SECRET_KEY is not configured (demo mode). */
export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key, { appInfo: { name: "RentFlow", url: "https://github.com/ssvay600-afk/rentflow" } }) : null;
  return cached;
}

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Tags Checkout Sessions so flows can be compared in the Stripe Dashboard. */
export function integrationIdentifier(flow: "rental" | "subscription") {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += letters[Math.floor(Math.random() * letters.length)];
  return `rentflow_${flow}_${suffix}`;
}

// ---------------------------------------------------------------------------
// Platform fee (direct charges: the connected account is merchant of record,
// RentFlow keeps application_fee_amount from each rental payment)
// ---------------------------------------------------------------------------

export const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 5);

export function platformFee(amountCents: number) {
  return Math.max(0, Math.min(amountCents - 1, Math.round((amountCents * PLATFORM_FEE_PERCENT) / 100)));
}

// ---------------------------------------------------------------------------
// SaaS plans (Stripe Billing). Price IDs come from `npm run stripe:setup`.
// ---------------------------------------------------------------------------

export type PlanKey = "starter" | "pro";

export const PLANS: Record<PlanKey, { name: string; amount: number; description: string; features: string[]; priceId: string | undefined }> = {
  starter: {
    name: "Starter",
    amount: 2900,
    description: "For a single location getting online.",
    features: ["Storefront & online booking", "Orders, inventory & customers", "Card payments via Stripe", "Email reminders (templates)"],
    priceId: process.env.STRIPE_PRICE_STARTER,
  },
  pro: {
    name: "Pro",
    amount: 7900,
    description: "For growing rental businesses.",
    features: ["Everything in Starter", "AI support bot with booking", "AI-written reminders & auto-send", "Priority support"],
    priceId: process.env.STRIPE_PRICE_PRO,
  },
};

export const TRIAL_DAYS = 14;

export function planKeyForPrice(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  for (const key of Object.keys(PLANS) as PlanKey[]) if (PLANS[key].priceId === priceId) return key;
  return null;
}

// ---------------------------------------------------------------------------
// Connect: one v2 Account per rental business
//   dashboard: full · fees_collector: stripe · losses_collector: stripe
//   merchant configuration (card_payments) for direct charges
//   customer configuration so the business can pay its RentFlow subscription
// ---------------------------------------------------------------------------

export async function ensureConnectedAccount(business: Business): Promise<string> {
  if (business.stripeAccountId) return business.stripeAccountId;
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const account = await stripe.v2.core.accounts.create({
    display_name: business.name,
    contact_email: business.email || undefined,
    dashboard: "full",
    identity: { country: business.country.toLowerCase() },
    configuration: {
      customer: { capabilities: { automatic_indirect_tax: { requested: true } } },
      merchant: { capabilities: { card_payments: { requested: true } } },
    },
    defaults: {
      currency: business.currency.toLowerCase(),
      responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
      locales: ["en-US"],
    },
    metadata: { businessId: business.id, slug: business.slug },
    include: ["configuration.merchant", "configuration.customer", "requirements"],
  });
  await prisma.business.update({ where: { id: business.id }, data: { stripeAccountId: account.id } });
  return account.id;
}

/** Stripe-hosted onboarding for the merchant + customer configurations. */
export async function createOnboardingLink(accountId: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const base = appUrl();
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "customer"],
        refresh_url: `${base}/dashboard/payouts?refresh=1`,
        return_url: `${base}/dashboard/payouts?onboarded=1`,
      },
    },
  });
  return link.url;
}

/** Re-reads capability status from Stripe and stores whether card payments are active. */
export async function syncAccountStatus(business: Business) {
  const stripe = getStripe();
  if (!stripe || !business.stripeAccountId) return business;
  const account = await stripe.v2.core.accounts.retrieve(business.stripeAccountId, {
    include: ["configuration.merchant", "requirements"],
  });
  const chargesEnabled = account.configuration?.merchant?.capabilities?.card_payments?.status === "active";
  const requirements = account.requirements?.entries ?? [];
  const onboarded = chargesEnabled || requirements.length === 0;
  return prisma.business.update({
    where: { id: business.id },
    data: { stripeChargesEnabled: chargesEnabled, stripeOnboarded: onboarded },
  });
}

// ---------------------------------------------------------------------------
// Rental payments: Checkout Session as a direct charge on the business's account
// ---------------------------------------------------------------------------

export async function createRentalCheckout(params: {
  business: Business;
  paymentId: string;
  orderId: string;
  orderNumber: number;
  amount: number;
  customerEmail: string;
}) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const { business } = params;
  if (!business.stripeAccountId || !business.stripeChargesEnabled) throw new Error("Business has not enabled online payments");
  const base = appUrl();
  const fee = platformFee(params.amount);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      ui_mode: "hosted_page",
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      submit_type: "auto",
      origin_context: "web",
      customer_email: params.customerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: business.currency.toLowerCase(),
            unit_amount: params.amount,
            product_data: { name: `${business.name} · Order #${params.orderNumber}` },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: fee,
        metadata: { paymentId: params.paymentId, orderId: params.orderId, businessId: business.id },
      },
      metadata: { paymentId: params.paymentId, orderId: params.orderId, businessId: business.id },
      integration_identifier: "hosted_web_0001",
      success_url: `${base}/s/${business.slug}/orders/${params.orderId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/s/${business.slug}/orders/${params.orderId}?cancelled=1`,
    },
    { stripeAccount: business.stripeAccountId },
  );
  return { session, fee };
}

/** Refunds a direct charge on the connected account, including the platform fee. */
export async function refundStripePayment(payment: { stripePaymentIntentId: string | null; stripeAccountId: string | null }) {
  const stripe = getStripe();
  if (!stripe || !payment.stripePaymentIntentId || !payment.stripeAccountId) return null;
  return stripe.refunds.create(
    { payment_intent: payment.stripePaymentIntentId, refund_application_fee: true },
    { stripeAccount: payment.stripeAccountId },
  );
}

// ---------------------------------------------------------------------------
// Billing: the business subscribes to RentFlow. The v2 account's customer
// configuration is the billing customer (customer_account), so no separate
// v1 Customer object is created.
// ---------------------------------------------------------------------------

export async function createSubscriptionCheckout(business: Business, planKey: PlanKey) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const plan = PLANS[planKey];
  if (!plan.priceId) throw new Error(`Price for plan "${planKey}" is not configured (run npm run stripe:setup)`);
  const accountId = await ensureConnectedAccount(business);
  const base = appUrl();
  const trialLeft = business.trialEndsAt ? Math.ceil((business.trialEndsAt.getTime() - Date.now()) / 86_400_000) : 0;
  return stripe.checkout.sessions.create({
    mode: "subscription",
    ui_mode: "hosted_page",
    billing_address_collection: "auto",
    phone_number_collection: { enabled: false },
    automatic_tax: { enabled: false },
    allow_promotion_codes: false,
    payment_method_collection: "always",
    submit_type: "auto",
    origin_context: "web",
    customer_account: accountId,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    subscription_data: {
      ...(trialLeft > 0 ? { trial_period_days: trialLeft } : {}),
      metadata: { businessId: business.id, planKey },
    },
    metadata: { businessId: business.id, planKey },
    integration_identifier: "hosted_web_0001",
    success_url: `${base}/billing?success=1`,
    cancel_url: `${base}/billing`,
  });
}

/**
 * Changes the plan on an existing active/trialing subscription in place
 * (prorated), instead of starting a second subscription through Checkout.
 */
export async function changeSubscriptionPlan(business: Business, planKey: PlanKey) {
  const stripe = getStripe();
  if (!stripe || !business.subscriptionId) throw new Error("No subscription to change");
  const plan = PLANS[planKey];
  if (!plan.priceId) throw new Error(`Price for plan "${planKey}" is not configured`);
  const current = await stripe.subscriptions.retrieve(business.subscriptionId);
  const item = current.items.data[0];
  const updated = await stripe.subscriptions.update(business.subscriptionId, {
    items: [{ id: item.id, price: plan.priceId }],
    proration_behavior: "create_prorations",
    metadata: { ...current.metadata, businessId: business.id, planKey },
  });
  return applySubscription(updated);
}

export function hasLiveSubscription(business: Business) {
  return Boolean(business.subscriptionId) && ["active", "trialing", "past_due"].includes(business.subscriptionStatus ?? "");
}

export async function createPortalSession(business: Business) {
  const stripe = getStripe();
  if (!stripe || !business.stripeAccountId) throw new Error("No billing account yet");
  return stripe.billingPortal.sessions.create({
    customer_account: business.stripeAccountId,
    return_url: `${appUrl()}/billing`,
  });
}

/** Copies subscription state from Stripe into the Business row. */
export async function applySubscription(sub: Stripe.Subscription) {
  const businessId = sub.metadata?.businessId;
  const item = sub.items.data[0];
  const priceId = item?.price?.id;
  const periodEndUnix = (item as { current_period_end?: number } | undefined)?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const where = businessId ? { id: businessId } : sub.customer_account ? { stripeAccountId: sub.customer_account } : null;
  if (!where) return null;
  const business = await prisma.business.findFirst({ where });
  if (!business) return null;
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  // Ignore terminal events for a subscription that isn't the one we track
  // (e.g. a cancelled duplicate) so they can't overwrite a live subscription.
  if (!active && business.subscriptionId && business.subscriptionId !== sub.id) return business;
  return prisma.business.update({
    where: { id: business.id },
    data: {
      subscriptionId: sub.id,
      subscriptionStatus: sub.status,
      planKey: planKeyForPrice(priceId) ?? (sub.metadata?.planKey as PlanKey | undefined) ?? business.planKey,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
      ...(active ? {} : {}),
    },
  });
}
