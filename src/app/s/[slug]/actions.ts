"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { markPaymentPaid, startPayment } from "@/lib/payments";

/** Simulated checkout used when Stripe is not configured. */
export async function completeSimulatedPayment(slug: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, method: "simulated", business: { slug } },
  });
  if (!payment) throw new Error("Payment not found");
  await markPaymentPaid(paymentId, { note: "Simulated payment (no Stripe key configured)" });
  redirect(`/s/${slug}/orders/${payment.orderId}?paid=1`);
}

/** "Pay now" from the customer order page. */
export async function payOrder(slug: string, orderId: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { slug } });
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId: business.id },
    include: { customer: true, payments: true },
  });
  if (!order) throw new Error("Order not found");
  const start = await startPayment(business, order);
  if (start.kind === "redirect") redirect(start.url);
  redirect(`/s/${slug}/orders/${orderId}${start.kind === "unavailable" ? "?unavailable=1" : ""}`);
}
