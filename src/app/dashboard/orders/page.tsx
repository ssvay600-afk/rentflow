import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ORDER_STATUSES, STATUS_LABEL, formatDateRange, formatMoney } from "@/lib/format";
import { paidAmount } from "@/lib/orders";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { business } = await requireBusiness();
  const { status, q } = await searchParams;
  const orders = await prisma.order.findMany({
    where: {
      businessId: business.id,
      ...(status && (ORDER_STATUSES as readonly string[]).includes(status) ? { status } : {}),
      ...(q
        ? {
            OR: [
              { customer: { name: { contains: q } } },
              { customer: { email: { contains: q } } },
              ...(Number.isInteger(Number(q)) ? [{ orderNumber: Number(q) }] : []),
            ],
          }
        : {}),
    },
    include: { customer: true, items: { include: { item: true } }, payments: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Bookings from your storefront, the support bot and manual entry."
        action={<Link href="/dashboard/orders/new" className="btn-primary">New order</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/dashboard/orders" className={`rounded-full px-3 py-1 text-sm ${!status ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>All</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/dashboard/orders?status=${s}`} className={`rounded-full px-3 py-1 text-sm ${status === s ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
            {STATUS_LABEL[s]}
          </Link>
        ))}
        <form className="ml-auto">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Search name, email or #" className="input w-56" />
        </form>
      </div>
      {orders.length === 0 ? (
        <EmptyState title="No orders match" body="Try a different filter, or create an order manually." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Items</th><th>Dates</th><th>Total</th><th>Paid</th><th>Status</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const paid = paidAmount(o.payments);
                return (
                  <tr key={o.id}>
                    <td><Link href={`/dashboard/orders/${o.id}`} className="font-medium text-teal-700 hover:underline">#{o.orderNumber}</Link><div className="text-xs text-slate-400">{o.source}</div></td>
                    <td>{o.customer.name}<div className="text-xs text-slate-500">{o.customer.email}</div></td>
                    <td className="max-w-xs truncate text-slate-600">{o.items.map((l) => `${l.quantity}× ${l.item.name}`).join(", ")}</td>
                    <td className="whitespace-nowrap text-slate-600">{formatDateRange(o.startDate, o.endDate)}</td>
                    <td>{formatMoney(o.total, business.currency)}</td>
                    <td className={paid >= o.total ? "text-emerald-700" : "text-amber-700"}>{formatMoney(paid, business.currency)}</td>
                    <td><Badge status={o.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
