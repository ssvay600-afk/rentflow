import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { completeSimulatedPayment } from "../../actions";

export default async function SimulatedPayPage({ params }: { params: Promise<{ slug: string; paymentId: string }> }) {
  const { slug, paymentId } = await params;
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, business: { slug } },
    include: { order: { include: { customer: true } }, business: true },
  });
  if (!payment) notFound();
  if (payment.status === "paid") redirect(`/s/${slug}/orders/${payment.orderId}?paid=1`);

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="card p-6">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Simulated checkout</p>
        <h1 className="mt-1 text-2xl font-semibold">{formatMoney(payment.amount, payment.currency)}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {payment.business.name} · Order #{payment.order.orderNumber} · {payment.order.customer.email}
        </p>
        <div className="mt-6 space-y-3">
          <input className="input" placeholder="Card number" defaultValue="4242 4242 4242 4242" readOnly />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="MM/YY" defaultValue="12/34" readOnly />
            <input className="input" placeholder="CVC" defaultValue="123" readOnly />
          </div>
        </div>
        <form action={completeSimulatedPayment.bind(null, slug, payment.id)} className="mt-6">
          <button className="btn-brand w-full py-3">Pay {formatMoney(payment.amount, payment.currency)}</button>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          This business hasn't connected Stripe yet, so no real charge is made. Set <span className="font-mono">STRIPE_SECRET_KEY</span> to enable real card payments.
        </p>
      </div>
    </main>
  );
}
