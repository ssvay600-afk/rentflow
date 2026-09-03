import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Alert, Badge, EmptyState, PageHeader, Stat } from "@/components/ui";
import { getStripe } from "@/lib/stripe";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const { business } = await requireBusiness();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [payments, month, allTime, outstanding] = await Promise.all([
    prisma.payment.findMany({
      where: { businessId: business.id },
      include: { order: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { businessId: business.id, status: "paid", paidAt: { gte: monthStart } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { businessId: business.id, status: "paid" } }),
    prisma.order.findMany({
      where: { businessId: business.id, status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] } },
      include: { payments: true },
    }),
  ]);
  const balanceDue = outstanding.reduce((s, o) => {
    const paid = o.payments.filter((p) => p.status === "paid").reduce((a, p) => a + p.amount, 0);
    return s + Math.max(0, o.total - paid);
  }, 0);

  return (
    <div>
      <PageHeader title="Payments" subtitle="Online card payments via Stripe plus manually recorded cash and bank payments." />
      {!getStripe() && (
        <div className="mb-6">
          <Alert tone="info">
            Stripe is not configured, so storefront checkout uses a simulated payment page. Set{" "}
            <span className="font-mono">STRIPE_SECRET_KEY</span> and <span className="font-mono">STRIPE_WEBHOOK_SECRET</span> to take real card payments.
          </Alert>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Collected this month" value={formatMoney(month._sum.amount ?? 0, business.currency)} />
        <Stat label="Collected all time" value={formatMoney(allTime._sum.amount ?? 0, business.currency)} />
        <Stat label="Outstanding balances" value={formatMoney(balanceDue, business.currency)} hint="Across open orders" tone={balanceDue ? "text-amber-700" : ""} />
      </div>
      {payments.length === 0 ? (
        <EmptyState title="No payments yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap text-slate-600">{formatDateTime(p.paidAt ?? p.createdAt)}</td>
                  <td><Link href={`/dashboard/orders/${p.orderId}`} className="text-teal-700 hover:underline">#{p.order.orderNumber}</Link></td>
                  <td>{p.order.customer.name}</td>
                  <td className="text-slate-600">{p.method}{p.note && <span className="block text-xs text-slate-400">{p.note}</span>}</td>
                  <td className="font-medium">{formatMoney(p.amount, p.currency)}</td>
                  <td><Badge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
