import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { listBusinesses, planMrr, subscriptionLabel, subscriptionTone } from "@/lib/admin-stats";
import { aiEnabled } from "@/lib/ai";
import { stripeEnabled } from "@/lib/stripe";
import { Badge, Card, Stat } from "@/components/ui";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const businesses = await listBusinesses();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [ordersThisMonth, feesThisMonth, volumeThisMonth, conversations, escalated, agentRuns] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.payment.aggregate({ _sum: { applicationFee: true }, where: { status: "paid", paidAt: { gte: monthStart } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "paid", paidAt: { gte: monthStart } } }),
    prisma.conversation.count(),
    prisma.conversation.count({ where: { escalated: true } }),
    prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { business: { select: { name: true } } } }),
  ]);

  const active = businesses.filter((b) => b.subscriptionStatus === "active");
  const trialing = businesses.filter((b) => b.subscriptionStatus === "trialing" || (!b.subscriptionStatus && b.trialEndsAt && b.trialEndsAt > now));
  const mrr = businesses.reduce((s, b) => s + planMrr(b.planKey, b.subscriptionStatus), 0);
  const connected = businesses.filter((b) => b.stripeChargesEnabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-sm text-slate-500">Every rental business on RentFlow, their plans, and the money flowing through the platform.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Businesses" value={String(businesses.length)} hint={`${connected} accepting card payments`} />
        <Stat label="Paying subscribers" value={String(active.length)} hint={`${trialing.length} on trial`} />
        <Stat label="MRR" value={formatMoney(mrr, "USD")} hint="Active plans × monthly price" />
        <Stat label="Platform fees this month" value={formatMoney(feesThisMonth._sum.applicationFee ?? 0, "USD")} hint={`on ${formatMoney(volumeThisMonth._sum.amount ?? 0, "USD")} rental volume`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Orders this month" value={String(ordersThisMonth)} />
        <Stat label="Bot conversations" value={String(conversations)} hint={escalated ? `${escalated} escalated` : "none escalated"} />
        <Stat label="Integrations" value={`${stripeEnabled() ? "Stripe ✓" : "Stripe ✗"} · ${aiEnabled() ? "Claude ✓" : "Claude ✗"}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recent signups" className="lg:col-span-2" action={<Link href="/admin/businesses" className="text-xs text-teal-700 hover:underline">All businesses</Link>}>
          <table className="table">
            <thead><tr><th>Business</th><th>Owner</th><th>Plan</th><th>Payments</th><th>Joined</th></tr></thead>
            <tbody>
              {businesses.slice(0, 8).map((b) => (
                <tr key={b.id}>
                  <td><Link href={`/admin/businesses/${b.id}`} className="font-medium text-teal-700 hover:underline">{b.name}</Link>{b.suspended && <span className="ml-2 rounded bg-rose-100 px-1.5 text-xs text-rose-700">suspended</span>}</td>
                  <td className="text-slate-600">{b.ownerEmail}</td>
                  <td><Badge status={subscriptionTone(b.subscriptionStatus, b.trialEndsAt)}>{subscriptionLabel(b)}</Badge></td>
                  <td>{b.stripeChargesEnabled ? <span className="text-xs text-emerald-700">Stripe active</span> : b.stripeAccountId ? <span className="text-xs text-amber-700">Onboarding</span> : <span className="text-xs text-slate-400">Not connected</span>}</td>
                  <td className="text-slate-500">{formatDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Reminder agent activity">
          {agentRuns.length === 0 ? (
            <p className="text-sm text-slate-500">No runs yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {agentRuns.map((r) => (
                <li key={r.id}>
                  <p className="font-medium">{r.business.name}</p>
                  <p className="text-xs text-slate-500">{formatDate(r.createdAt)} · {r.created} drafted · {r.sent} sent · {r.usedAi ? "Claude" : "templates"}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
