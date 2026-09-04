import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/format";
import { listBusinesses, planMrr } from "@/lib/admin-stats";
import { PLANS, PLATFORM_FEE_PERCENT, type PlanKey } from "@/lib/stripe";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Revenue" };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function AdminRevenue() {
  const [businesses, paid] = await Promise.all([
    listBusinesses(),
    prisma.payment.findMany({
      where: { status: "paid" },
      include: { order: { select: { orderNumber: true } }, business: { select: { name: true, id: true } } },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const mrr = businesses.reduce((s, b) => s + planMrr(b.planKey, b.subscriptionStatus), 0);
  const byPlan = (Object.keys(PLANS) as PlanKey[]).map((key) => ({
    key,
    name: PLANS[key].name,
    active: businesses.filter((b) => b.planKey === key && b.subscriptionStatus === "active").length,
    trialing: businesses.filter((b) => b.planKey === key && b.subscriptionStatus === "trialing").length,
  }));

  const months = new Map<string, { volume: number; fees: number; stripe: number; count: number }>();
  for (const p of paid) {
    const k = monthKey(p.paidAt ?? p.createdAt);
    const m = months.get(k) ?? { volume: 0, fees: 0, stripe: 0, count: 0 };
    m.volume += p.amount;
    m.fees += p.applicationFee;
    if (p.method === "stripe") m.stripe += p.amount;
    m.count += 1;
    months.set(k, m);
  }
  const totalFees = paid.reduce((s, p) => s + p.applicationFee, 0);
  const totalVolume = paid.reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <PageHeader title="Revenue" subtitle="Subscription revenue from plans plus platform fees on rental payments." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="MRR from plans" value={formatMoney(mrr, "USD")} hint={byPlan.map((p) => `${p.active} ${p.name}`).join(" · ")} />
        <Stat label="Platform fees (all time)" value={formatMoney(totalFees, "USD")} hint={`${PLATFORM_FEE_PERCENT}% of Stripe rental payments`} />
        <Stat label="Rental volume (all time)" value={formatMoney(totalVolume, "USD")} hint={`${paid.length} paid payments across all methods`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="By month" className="lg:col-span-2">
          {months.size === 0 ? (
            <p className="text-sm text-slate-500">No paid payments yet.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Month</th><th>Payments</th><th>Rental volume</th><th>Via Stripe</th><th>Platform fees</th></tr></thead>
              <tbody>
                {Array.from(months.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, m]) => (
                  <tr key={k}>
                    <td className="font-medium">{k}</td>
                    <td>{m.count}</td>
                    <td>{formatMoney(m.volume, "USD")}</td>
                    <td className="text-slate-600">{formatMoney(m.stripe, "USD")}</td>
                    <td className="font-medium text-emerald-700">{formatMoney(m.fees, "USD")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Plans">
          <ul className="space-y-2 text-sm">
            {byPlan.map((p) => (
              <li key={p.key} className="flex items-center justify-between">
                <span>{p.name} <span className="text-slate-400">{formatMoney(PLANS[p.key].amount, "USD")}/mo</span></span>
                <span className="text-slate-600">{p.active} active · {p.trialing} trial</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Subscription charges land in the platform Stripe account. Rental payments land in each business's connected account; only the fee comes to the platform.</p>
        </Card>
      </div>

      <Card title="Recent paid payments" className="mt-6">
        {paid.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th><th>Business</th><th>Order</th><th>Method</th><th>Amount</th><th>Platform fee</th></tr></thead>
              <tbody>
                {paid.slice(0, 50).map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap text-slate-600">{formatDateTime(p.paidAt ?? p.createdAt)}</td>
                    <td><Link href={`/admin/businesses/${p.business.id}`} className="text-teal-700 hover:underline">{p.business.name}</Link></td>
                    <td>#{p.order.orderNumber}</td>
                    <td><Badge>{p.method}</Badge></td>
                    <td>{formatMoney(p.amount, p.currency)}</td>
                    <td className="text-emerald-700">{formatMoney(p.applicationFee, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
