import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { markPaymentPaid } from "@/lib/payments";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Stripe not configured" }, { status: 501 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${err instanceof Error ? err.message : "unknown"}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const paymentId = session.metadata?.paymentId;
    if (paymentId && session.payment_status === "paid") {
      await markPaymentPaid(paymentId, {
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      });
    }
  } else if (event.type === "checkout.session.expired") {
    const paymentId = event.data.object.metadata?.paymentId;
    if (paymentId) {
      await prisma.payment.updateMany({ where: { id: paymentId, status: "pending" }, data: { status: "failed", note: "Checkout expired" } });
    }
  }

  return NextResponse.json({ received: true });
}
