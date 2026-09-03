import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { updateCustomerNotes } from "../actions";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { business } = await requireBusiness();
  const { q } = await searchParams;
  const customers = await prisma.customer.findMany({
    where: {
      businessId: business.id,
      ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] } : {}),
    },
    include: {
      orders: { include: { payments: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Everyone who has booked with you, with lifetime value and notes."
        action={
          <form>
            <input name="q" defaultValue={q} placeholder="Search customers" className="input w-56" />
          </form>
        }
      />
      {customers.length === 0 ? (
        <EmptyState title="No customers yet" body="Customers are created automatically when an order is placed." />
      ) : (
        <div className="space-y-3">
          {customers.map((c) => {
            const spent = c.orders.flatMap((o) => o.payments).filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
            return (
              <details key={c.id} className="card">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
                  </div>
                  <div className="flex gap-6 text-sm text-slate-600">
                    <span>{c.orders.length} order{c.orders.length === 1 ? "" : "s"}</span>
                    <span className="font-medium text-slate-900">{formatMoney(spent, business.currency)}</span>
                    <span className="text-xs text-slate-400">since {formatDate(c.createdAt)}</span>
                  </div>
                </summary>
                <div className="grid gap-4 border-t border-slate-100 px-5 py-4 md:grid-cols-2">
                  <div>
                    <p className="label">Orders</p>
                    <ul className="space-y-1 text-sm">
                      {c.orders.map((o) => (
                        <li key={o.id}>
                          <Link href={`/dashboard/orders/${o.id}`} className="text-teal-700 hover:underline">#{o.orderNumber}</Link>{" "}
                          <span className="text-slate-500">{formatDate(o.startDate)} · {formatMoney(o.total, business.currency)} · {o.status.toLowerCase()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <form action={updateCustomerNotes.bind(null, c.id)}>
                    <p className="label">Notes</p>
                    <textarea name="notes" defaultValue={c.notes} rows={3} className="input" placeholder="Preferences, ID verified, etc." />
                    <button className="btn-secondary mt-2">Save</button>
                  </form>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
