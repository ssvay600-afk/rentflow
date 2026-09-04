import type { DomainPurchase } from "@prisma/client";
import { prisma } from "./db";
import { addDomainToVercel, buyDomain, getDomainOrder, quoteDomain, type RegistrantContact } from "./domains";
import { getStripe } from "./stripe";

/**
 * Lifecycle of a domain bought through RentFlow:
 *   pending_payment → (Stripe webhook) paid → purchasing → completed | failed → refunded
 * The Stripe webhook calls `onDomainPaymentSucceeded`; the Settings page and
 * "Check status" call `settleDomainPurchase` until the registrar order finishes.
 */

export async function onDomainPaymentSucceeded(purchaseId: string, paymentIntentId?: string) {
  const purchase = await prisma.domainPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase || purchase.status !== "pending_payment") return purchase;
  await prisma.domainPurchase.update({
    where: { id: purchaseId },
    data: { status: "paid", stripePaymentIntentId: paymentIntentId ?? purchase.stripePaymentIntentId },
  });
  return startRegistrarOrder(purchaseId);
}

async function startRegistrarOrder(purchaseId: string): Promise<DomainPurchase> {
  const purchase = await prisma.domainPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  if (purchase.status !== "paid") return purchase;
  const contact = JSON.parse(purchase.contactJson) as RegistrantContact;
  try {
    // Re-check price and availability so we never overpay or buy a taken name.
    const quote = await quoteDomain(purchase.domain, purchase.years);
    if (!quote.available) throw new Error("The domain was taken before the purchase completed.");
    if (quote.vercelPrice > purchase.vercelPrice) throw new Error("The registrar price changed before purchase.");
    const orderId = await buyDomain(purchase.domain, purchase.years, quote.vercelPrice, contact);
    const updated = await prisma.domainPurchase.update({
      where: { id: purchaseId },
      data: { status: "purchasing", vercelOrderId: orderId },
    });
    return settleDomainPurchase(updated.id, 15_000);
  } catch (error) {
    return failAndRefund(purchaseId, error instanceof Error ? error.message : "Purchase failed");
  }
}

/** Polls the registrar order for up to `waitMs`, then attaches the domain or refunds. */
export async function settleDomainPurchase(purchaseId: string, waitMs = 0): Promise<DomainPurchase> {
  let purchase = await prisma.domainPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { business: true } });
  if (purchase.status === "paid") return startRegistrarOrder(purchaseId);
  if (purchase.status !== "purchasing" || !purchase.vercelOrderId) return purchase;

  const deadline = Date.now() + waitMs;
  let order = await getDomainOrder(purchase.vercelOrderId);
  while (order.status === "purchasing" || order.status === "draft") {
    if (Date.now() >= deadline) return purchase; // still in progress; caller re-checks later
    await new Promise((r) => setTimeout(r, 2500));
    order = await getDomainOrder(purchase.vercelOrderId);
  }

  if (order.status === "failed") return failAndRefund(purchaseId, order.error ?? "The registrar could not complete the order.");

  // completed: attach to the project and make it the storefront domain.
  const added = await addDomainToVercel(purchase.domain);
  purchase = await prisma.domainPurchase.update({
    where: { id: purchaseId },
    data: {
      status: "completed",
      expiresAt: new Date(Date.now() + purchase.years * 365 * 86_400_000),
      error: added.ok ? "" : `Registered, but attaching failed: ${added.error}`,
    },
    include: { business: true },
  });
  await prisma.business.update({
    where: { id: purchase.businessId },
    data: { customDomain: purchase.domain, customDomainVerified: added.ok, customDomainAddedAt: new Date() },
  });
  return purchase;
}

async function failAndRefund(purchaseId: string, reason: string): Promise<DomainPurchase> {
  const purchase = await prisma.domainPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
  let status = "failed";
  let note = reason;
  const stripe = getStripe();
  if (stripe && purchase.stripePaymentIntentId) {
    try {
      await stripe.refunds.create({ payment_intent: purchase.stripePaymentIntentId });
      status = "refunded";
      note = `${reason} Your payment has been refunded.`;
    } catch (e) {
      note = `${reason} Refund failed: ${e instanceof Error ? e.message : "unknown"} – the RentFlow team will refund manually.`;
    }
  }
  return prisma.domainPurchase.update({ where: { id: purchaseId }, data: { status, error: note } });
}
