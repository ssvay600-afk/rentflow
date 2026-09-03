import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatDateRange, formatMoney } from "@/lib/format";
import { getAvailability } from "@/lib/orders";
import { aiEnabled } from "@/lib/ai";
import { Alert, Badge, Card, EmptyState, Stat } from "@/components/ui";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { business } = await requireBusiness();
  const { welcome } = await searchParams;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const [revenue, openOrders, active, pickups, returns, overdue, recentOrders, items, lastRun, escalated] =
    await Promise.all([
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { businessId: business.id, status: "paid", paidAt: { gte: monthStart } },
      }),
      prisma.order.count({ where: { businessId: business.id, status: { in: ["PENDING", "CONFIRMED"] } } }),
      prisma.order.count({ where: { businessId: business.id, status: "ACTIVE" } }),
      prisma.order.findMany({
        where: { businessId: business.id, status: "CONFIRMED", startDate: { gte: today, lte: weekAhead } },
        include: { customer: true, items: { include: { item: true } } },
        orderBy: { startDate: "asc" },
      }),
      prisma.order.findMany({
        where: { businessId: business.id, status: "ACTIVE", endDate: { gte: today, lte: weekAhead } },
        include: { customer: true, items: { include: { item: true } } },
        orderBy: { endDate: "asc" },
      }),
      prisma.order.findMany({
        where: { businessId: business.id, status: "ACTIVE", endDate: { lt: today } },
        include: { customer: true },
        orderBy: { endDate: "asc" },
      }),
      prisma.order.findMany({
        where: { businessId: business.id },
        include: { customer: true, payments: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.item.findMany({ where: { businessId: business.id, active: true } }),
      prisma.agentRun.findFirst({ where: { businessId: business.id }, orderBy: { createdAt: "desc" } }),
      prisma.conversation.count({ where: { businessId: business.id, escalated: true } }),
    ]);

  const availability = await getAvailability(
    business.id,
    items.map((i) => i.id),
    today,
    today,
  );
  const lowStock = items.filter((i) => (availability.get(i.id) ?? 0) <= business.lowStockThreshold);

  return (
    <div className="space-y-6">
      {welcome && (
        <Alert tone="success">
          Your storefront is live at <Link href={`/s/${business.slug}`} className="font-medium underline">/s/{business.slug}</Link>.
          Next: <Link href="/dashboard/inventory/new" className="font-medium underline">add your first item</Link>.
        </Alert>
      )}
      {!aiEnabled() && (
        <Alert tone="warn">
          Demo mode: no <span className="font-mono">ANTHROPIC_API_KEY</span> set. The support bot uses a rule-based fallback and
          reminders use templates. Add the key in <span className="font-mono">.env</span> to enable Claude.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue this month" value={formatMoney(revenue._sum.amount ?? 0, business.currency)} />
        <Stat label="Open orders" value={String(openOrders)} hint="Pending or confirmed" />
        <Stat label="Out on rental" value={String(active)} hint={overdue.length ? `${overdue.length} overdue` : "None overdue"} tone={overdue.length ? "text-rose-700" : ""} />
        <Stat label="Low stock today" value={String(lowStock.length)} hint={`≤ ${business.lowStockThreshold} units free`} tone={lowStock.length ? "text-amber-700" : ""} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upcoming pickups (7 days)">
          {pickups.length === 0 ? (
            <p className="text-sm text-slate-500">No confirmed pickups this week.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pickups.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link href={`/dashboard/orders/${o.id}`} className="font-medium hover:underline">#{o.orderNumber} · {o.customer.name}</Link>
                    <p className="text-xs text-slate-500">{o.items.map((l) => `${l.quantity}× ${l.item.name}`).join(", ")}</p>
                  </div>
                  <span className="text-slate-600">{formatDate(o.startDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Returns due (7 days)">
          {overdue.length > 0 && (
            <ul className="mb-3 space-y-1">
              {overdue.map((o) => (
                <li key={o.id} className="flex justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <Link href={`/dashboard/orders/${o.id}`} className="font-medium hover:underline">#{o.orderNumber} · {o.customer.name}</Link>
                  <span>Overdue since {formatDate(o.endDate)}</span>
                </li>
              ))}
            </ul>
          )}
          {returns.length === 0 ? (
            <p className="text-sm text-slate-500">No returns due this week.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {returns.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link href={`/dashboard/orders/${o.id}`} className="font-medium hover:underline">#{o.orderNumber} · {o.customer.name}</Link>
                    <p className="text-xs text-slate-500">{o.items.map((l) => `${l.quantity}× ${l.item.name}`).join(", ")}</p>
                  </div>
                  <span className="text-slate-600">{formatDate(o.endDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recent orders" className="lg:col-span-2" action={<Link href="/dashboard/orders" className="text-xs text-teal-700 hover:underline">All orders</Link>}>
          {recentOrders.length === 0 ? (
            <EmptyState title="No orders yet" body="Orders from your storefront, the bot and manual entry will show here." />
          ) : (
            <table className="table">
              <thead>
                <tr><th>Order</th><th>Customer</th><th>Dates</th><th>Total</th><th>Status</th></tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/dashboard/orders/${o.id}`} className="font-medium hover:underline">#{o.orderNumber}</Link></td>
                    <td>{o.customer.name}</td>
                    <td className="text-slate-600">{formatDateRange(o.startDate, o.endDate)}</td>
                    <td>{formatMoney(o.total, business.currency)}</td>
                    <td><Badge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="AI reminder agent" action={<Link href="/dashboard/reminders" className="text-xs text-teal-700 hover:underline">Manage</Link>}>
            {lastRun ? (
              <>
                <p className="text-sm text-slate-700">{lastRun.summary}</p>
                <p className="mt-2 text-xs text-slate-500">Last run {formatDate(lastRun.createdAt)} · {lastRun.usedAi ? "Claude" : "templates"}</p>
              </>
            ) : (
              <p className="text-sm text-slate-500">The agent hasn't run yet.</p>
            )}
          </Card>
          <Card title="Support bot" action={<Link href="/dashboard/bot" className="text-xs text-teal-700 hover:underline">Inbox</Link>}>
            <p className="text-sm text-slate-700">
              {escalated === 0 ? "No conversations need your attention." : `${escalated} conversation${escalated === 1 ? "" : "s"} escalated to you.`}
            </p>
          </Card>
          {lowStock.length > 0 && (
            <Card title="Low stock today">
              <ul className="space-y-1 text-sm">
                {lowStock.map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <Link href={`/dashboard/inventory/${i.id}`} className="hover:underline">{i.name}</Link>
                    <span className="text-amber-700">{availability.get(i.id) ?? 0} / {i.quantity} free</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
