import type { Business, Order, Customer } from "@prisma/client";
import { prisma } from "./db";
import { paidAmount } from "./orders";
import { createStripeCheckout, getStripe } from "./stripe";

/**
 * Starts an online payment for an order's outstanding balance.
 * Returns the URL the customer should be sent to (Stripe Checkout or the
 * built-in simulated payment page) or null if nothing is owed.
 */
export async function startPayment(business: Business, order: Order & { customer: Customer; payments: { status: string; amount: number }[] }) {
  const balance = order.total - paidAmount(order.payments);
  if (balance <= 0 || order.status === "CANCELLED") return null;

  // Reuse an open pending payment for this order if one exists.
  const existing = await prisma.payment.findFirst({
    where: { orderId: order.id, status: "pending", amount: balance },
    orderBy: { createdAt: "desc" },
  });

  const stripe = getStripe();
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
      },
    }));

  if (stripe) {
    const session = await createStripeCheckout({
      paymentId: payment.id,
      businessSlug: business.slug,
      businessName: business.name,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: balance,
      currency: business.currency,
      customerEmail: order.customer.email,
    });
    if (session?.url) {
      await prisma.payment.update({ where: { id: payment.id }, data: { stripeSessionId: session.id } });
      return session.url;
    }
  }
  return `/s/${business.slug}/pay/${payment.id}`;
}

/** Marks a payment as paid and confirms the order if it was pending. */
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
