import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { markPaymentFailed, markPaymentPaid } from "./payments";
import { applySubscription, getStripe, syncAccountStatus } from "./stripe";
import { onDomainPaymentSucceeded } from "./domain-purchases";

/** Records the event id; returns true if it was already handled (Stripe retries deliveries). */
async function alreadyProcessed(event: Stripe.Event) {
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type, account: event.account ?? null } });
    return false;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return true;
    throw error;
  }
}

/**
 * Platform-account events: the businesses' RentFlow subscriptions.
 * Endpoint: /api/webhooks/stripe (connect: false)
 */
export async function handlePlatformEvent(event: Stripe.Event) {
  if (await alreadyProcessed(event)) return;
  const stripe = getStripe();
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription && stripe) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await applySubscription(await stripe.subscriptions.retrieve(subId));
      }
      const domainPurchaseId = session.metadata?.domainPurchaseId;
      if (domainPurchaseId && session.payment_status !== "unpaid") {
        await onDomainPaymentSucceeded(domainPurchaseId, typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await applySubscription(event.data.object);
      break;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subRef =
        (invoice as unknown as { subscription?: string | { id: string } }).subscription ??
        invoice.parent?.subscription_details?.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (subId && stripe) await applySubscription(await stripe.subscriptions.retrieve(subId));
      break;
    }
    default:
      break;
  }
}

/**
 * Connected-account events: rental payments (direct charges) and account status.
 * Endpoint: /api/webhooks/stripe/connect (connect: true)
 */
export async function handleConnectEvent(event: Stripe.Event) {
  if (await alreadyProcessed(event)) return;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const paymentId = session.metadata?.paymentId;
      // With delayed-notification methods `completed` can arrive while still unpaid.
      if (paymentId && session.payment_status !== "unpaid") {
        await markPaymentPaid(paymentId, {
          stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
        });
      }
      break;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const paymentId = event.data.object.metadata?.paymentId;
      if (paymentId) await markPaymentFailed(paymentId, event.type === "checkout.session.expired" ? "Checkout expired" : "Payment failed");
      break;
    }
    case "account.updated": {
      const accountId = event.account ?? event.data.object.id;
      const business = await prisma.business.findFirst({ where: { stripeAccountId: accountId } });
      if (business) await syncAccountStatus(business);
      break;
    }
    default:
      break;
  }
}
