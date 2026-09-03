import type { Business, Order, Customer } from "@prisma/client";
import { prisma } from "./db";
import { paidAmount } from "./orders";
import { createRentalCheckout, getStripe } from "./stripe";

export type PaymentStart =
  | { kind: "redirect"; url: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "nothing_due" };

/**
 * Starts an online payment for an order's outstanding balance.
 *  - Stripe configured + business onboarded → Checkout Session on the business's
 *    connected account (direct charge with a platform fee).
 *  - Stripe configured but business not onboarded → unavailable (pay at pickup).
 *  - No Stripe key (demo) → built-in simulated payment page.
 */
export async function startPayment(
  business: Business,
  order: Order & { customer: Customer; payments: { status: string; amount: number }[] },
): Promise<PaymentStart> {
  const balance = order.total - paidAmount(order.payments);
  if (balance <= 0 || order.status === "CANCELLED") return { kind: "nothing_due" };

  const stripe = getStripe();
  if (stripe && !(business.stripeAccountId && business.stripeChargesEnabled)) {
    return { kind: "unavailable", reason: `${business.name} hasn't enabled online payments yet. Please pay at pickup.` };
  }

  const existing = await prisma.payment.findFirst({
    where: { orderId: order.id, status: "pending", amount: balance },
    orderBy: { createdAt: "desc" },
  });
  const payment =
    existing ??
    (await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        amount: balance,
        currency: business.currency,
        method: stripe ? "stripe" : "simulated",
        status: "pending",
        stripeAccountId: stripe ? business.stripeAccountId : null,
      },
    }));

  if (stripe) {
    const { session, fee } = await createRentalCheckout({
      business,
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: balance,
      customerEmail: order.customer.email,
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { stripeSessionId: session.id, applicationFee: fee, stripeAccountId: business.stripeAccountId },
    });
    if (!session.url) return { kind: "unavailable", reason: "Stripe did not return a checkout URL." };
    return { kind: "redirect", url: session.url };
  }
  return { kind: "redirect", url: `/s/${business.slug}/pay/${payment.id}` };
}

/** Marks a payment as paid and confirms the order if it was pending. Idempotent. */
export async function markPaymentPaid(paymentId: string, extra: { stripePaymentIntentId?: string; note?: string } = {}) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) return null;
  if (payment.status === "paid") return payment;
  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "paid", paidAt: new Date(), ...extra },
  });
  if (payment.order.status === "PENDING") {
    await prisma.order.update({ where: { id: payment.orderId }, data: { status: "CONFIRMED" } });
  }
  return updated;
}

export async function markPaymentFailed(paymentId: string, note: string) {
  await prisma.payment.updateMany({ where: { id: paymentId, status: "pending" }, data: { status: "failed", note } });
}
