import Stripe from "stripe";

let cached: Stripe | null | undefined;

/** Returns a Stripe client, or null when STRIPE_SECRET_KEY is not configured. */
export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key) : null;
  return cached;
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function createStripeCheckout(params: {
  paymentId: string;
  businessSlug: string;
  businessName: string;
  orderId: string;
  orderNumber: number;
  amount: number;
  currency: string;
  customerEmail: string;
}) {
  const stripe = getStripe();
  if (!stripe) return null;
  const base = appUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: params.amount,
          product_data: { name: `${params.businessName} · Order #${params.orderNumber}` },
        },
      },
    ],
    metadata: { paymentId: params.paymentId, orderId: params.orderId },
    success_url: `${base}/s/${params.businessSlug}/orders/${params.orderId}?paid=1`,
    cancel_url: `${base}/s/${params.businessSlug}/orders/${params.orderId}?cancelled=1`,
  });
  return session;
}
