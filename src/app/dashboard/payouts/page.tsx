import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PLATFORM_FEE_PERCENT, stripeEnabled, syncAccountStatus } from "@/lib/stripe";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { connectStripe, refreshStripeStatus } from "../actions";

export const metadata = { title: "Get paid" };

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ onboarded?: string; refresh?: string }> }) {
  let { business } = await requireBusiness();
  const { onboarded, refresh } = await searchParams;
  if (business.stripeAccountId && (onboarded || refresh)) business = await syncAccountStatus(business);

  const stripePayments = await prisma.payment.findMany({
    where: { businessId: business.id, method: "stripe" },
    include: { order: { include: { customer: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const collected = stripePayments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const fees = stripePayments.filter((p) => p.status === "paid").reduce((s, p) => s + p.applicationFee, 0);

  return (
    <div>
      <PageHeader
        title="Get paid online"
        subtitle="Customers pay by card on your storefront. Money lands in your own Stripe account; RentFlow keeps a small platform fee per booking."
      />
      {!stripeEnabled() ? (
        <Alert tone="info">
          Stripe isn&apos;t configured on this RentFlow install, so the storefront uses a simulated payment page. The platform owner needs to set{" "}
          <span className="font-mono">STRIPE_SECRET_KEY</span>.
        </Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Stripe account">
              {!business.stripeAccountId ? (
                <>
                  <p className="text-sm text-slate-600">
                    Connect a Stripe account to accept card payments. Stripe will ask for your business details, bank account and identity; it takes about five minutes.
                  </p>
                  <form action={connectStripe} className="mt-4">
                    <SubmitButton pendingText="Opening Stripe…">Connect with Stripe</SubmitButton>
                  </form>
                </>
              ) : business.stripeChargesEnabled ? (
                <>
                  <p className="flex items-center gap-2 text-sm">
                    <Badge status="paid">Card payments active</Badge>
                    <span className="font-mono text-xs text-slate-500">{business.stripeAccountId}</span>
                  </p>
                  <p className="mt-3 text-sm text-slate-600">
                    Your storefront now takes online payments. Payouts, disputes and tax settings live in your Stripe Dashboard.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href="https://dashboard.stripe.com/" target="_blank" className="btn-primary">Open Stripe Dashboard ↗</a>
                    <form action={refreshStripeStatus}><SubmitButton className="btn-secondary" pendingText="Checking…">Refresh status</SubmitButton></form>
                  </div>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-sm">
                    <Badge status="pending">Onboarding incomplete</Badge>
                    <span className="font-mono text-xs text-slate-500">{business.stripeAccountId}</span>
                  </p>
                  <p className="mt-3 text-sm text-slate-600">
                    Stripe still needs some information before card payments can be enabled. Continue where you left off, then refresh.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={connectStripe}><SubmitButton pendingText="Opening Stripe…">Continue onboarding</SubmitButton></form>
                    <form action={refreshStripeStatus}><SubmitButton className="btn-secondary" pendingText="Checking…">Refresh status</SubmitButton></form>
                  </div>
                </>
              )}
            </Card>

            <Card title="Online payments">
              {stripePayments.length === 0 ? (
                <p className="text-sm text-slate-500">No card payments yet.</p>
              ) : (
                <table className="table">
                  <thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Amount</th><th>Platform fee</th><th>Status</th></tr></thead>
                  <tbody>
                    {stripePayments.map((p) => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap text-slate-600">{formatDateTime(p.paidAt ?? p.createdAt)}</td>
                        <td><Link href={`/dashboard/orders/${p.orderId}`} className="text-teal-700 hover:underline">#{p.order.orderNumber}</Link></td>
                        <td>{p.order.customer.name}</td>
                        <td>{formatMoney(p.amount, p.currency)}</td>
                        <td className="text-slate-500">{formatMoney(p.applicationFee, p.currency)}</td>
                        <td><Badge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
          <div className="space-y-6">
            <Card title="How fees work">
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• Customers pay on a Stripe Checkout page branded as your business.</li>
                <li>• Stripe&apos;s processing fee is charged to your account, like any Stripe merchant.</li>
                <li>• RentFlow keeps a {PLATFORM_FEE_PERCENT}% platform fee per booking. Refunds return the fee too.</li>
                <li>• Payout timing and bank details are managed in your Stripe Dashboard.</li>
              </ul>
            </Card>
            <Card title="Collected via Stripe">
              <p className="text-2xl font-semibold">{formatMoney(collected, business.currency)}</p>
              <p className="text-xs text-slate-500">of which {formatMoney(fees, business.currency)} platform fees</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
