import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { STATUS_LABEL, formatAddress, formatDate, formatMoney } from "@/lib/format";
import { paidAmount } from "@/lib/orders";
import { payOrder } from "../../actions";

export default async function CustomerOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ paid?: string; cancelled?: string; unavailable?: string }>;
}) {
  const { slug, id } = await params;
  const { paid, cancelled, unavailable } = await searchParams;
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) notFound();
  const order = await prisma.order.findFirst({
    where: { id, businessId: business.id },
    include: { customer: true, items: { include: { item: true } }, payments: true },
  });
  if (!order) notFound();

  // The webhook is the source of truth; this only shortens the wait when the
  // customer lands here before Stripe's event has been delivered.
  if (paid && process.env.STRIPE_SECRET_KEY) {
    const { getStripe } = await import("@/lib/stripe");
    const { markPaymentPaid } = await import("@/lib/payments");
    const pending = order.payments.filter((p) => p.status === "pending" && p.stripeSessionId);
    const stripe = getStripe();
    for (const p of pending) {
      const session = await stripe!.checkout.sessions.retrieve(p.stripeSessionId!, undefined, p.stripeAccountId ? { stripeAccount: p.stripeAccountId } : undefined);
      if (session.payment_status === "paid") {
        await markPaymentPaid(p.id, { stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined });
        p.status = "paid";
      }
    }
    if (pending.some((p) => p.status === "paid") && order.status === "PENDING") order.status = "CONFIRMED";
  }

  const paidTotal = paidAmount(order.payments);
  const balance = order.total - paidTotal;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {paid && balance <= 0 && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Payment received. Your reservation is confirmed and a confirmation is on its way to {order.customer.email}.
        </div>
      )}
      {cancelled && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Payment was cancelled. Your reservation is held as pending; you can pay below.
        </div>
      )}
      {unavailable && (
        <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Your reservation request is in. {business.name} hasn&apos;t enabled online payments yet, so please pay at pickup. They&apos;ll confirm your booking shortly.
        </div>
      )}
      <p className="text-sm text-slate-500">Order #{order.orderNumber}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{STATUS_LABEL[order.status]}</h1>
      <p className="mt-1 text-slate-600">Pickup {formatDate(order.startDate)} · Return {formatDate(order.endDate)}</p>

      <div className="card mt-8 p-6">
        <table className="table">
          <tbody>
            {order.items.map((l) => (
              <tr key={l.id}>
                <td>{l.quantity}× {l.item.name}</td>
                <td className="text-slate-500">{l.days} day{l.days === 1 ? "" : "s"} @ {formatMoney(l.unitPrice, business.currency)}</td>
                <td className="text-right">{formatMoney(l.lineTotal, business.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 ml-auto w-64 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatMoney(order.subtotal, business.currency)}</dd></div>
          {order.tax > 0 && <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd>{formatMoney(order.tax, business.currency)}</dd></div>}
          {order.deposit > 0 && <div className="flex justify-between"><dt className="text-slate-500">Deposit</dt><dd>{formatMoney(order.deposit, business.currency)}</dd></div>}
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Total</dt><dd>{formatMoney(order.total, business.currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd>{formatMoney(paidTotal, business.currency)}</dd></div>
          {balance > 0 && <div className="flex justify-between font-medium text-amber-700"><dt>Balance due</dt><dd>{formatMoney(balance, business.currency)}</dd></div>}
        </dl>
        {balance > 0 && order.status !== "CANCELLED" && (
          <form action={payOrder.bind(null, slug, order.id)} className="mt-6">
            <button className="btn-brand w-full py-3">Pay {formatMoney(balance, business.currency)} now</button>
          </form>
        )}
      </div>

      <div className="mt-8 text-sm text-slate-600">
        <p className="font-medium text-slate-900">{order.customer.name}</p>
        <p>{order.customer.email}{order.customer.phone && ` · ${order.customer.phone}`}</p>
        <p className="mt-2"><span className="font-medium text-slate-900">{order.fulfillment === "pickup" ? "Pickup" : "Service address"}:</span> {formatAddress(order)}</p>
        {order.notes && <p className="mt-1"><span className="font-medium text-slate-900">Notes:</span> {order.notes}</p>}
        <p className="mt-4">
          Questions? {business.email && <a href={`mailto:${business.email}`} className="underline">{business.email}</a>}
          {business.phone && <> · {business.phone}</>} · or ask the chat assistant.
        </p>
        <Link href={`/s/${slug}`} className="mt-6 inline-block underline">Back to {business.name}</Link>
      </div>
    </main>
  );
}
