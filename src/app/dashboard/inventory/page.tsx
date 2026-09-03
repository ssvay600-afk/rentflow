import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { getAvailability } from "@/lib/orders";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addCategory, deleteCategory, deleteItem } from "../actions";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const { business } = await requireBusiness();
  const [items, categories] = await Promise.all([
    prisma.item.findMany({ where: { businessId: business.id }, include: { category: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.category.findMany({ where: { businessId: business.id }, include: { _count: { select: { items: true } } }, orderBy: { name: "asc" } }),
  ]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const availability = await getAvailability(business.id, items.map((i) => i.id), today, today);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Units, pricing and deposits. Availability is computed from live bookings."
        action={<Link href="/dashboard/inventory/new" className="btn-primary">Add item</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          {items.length === 0 ? (
            <EmptyState title="No items yet" body="Add the things you rent out. Each item can have multiple units." action={<Link href="/dashboard/inventory/new" className="btn-primary">Add your first item</Link>} />
          ) : (
            <div className="card overflow-x-auto">
              <table className="table">
                <thead><tr><th></th><th>Item</th><th>Category</th><th>Rate</th><th>Deposit</th><th>Free today</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {items.map((it) => {
                    const free = availability.get(it.id) ?? 0;
                    const low = free <= business.lowStockThreshold;
                    return (
                      <tr key={it.id} className={it.active ? "" : "opacity-60"}>
                        <td className="w-12">
                          {it.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded bg-slate-100" />
                          )}
                        </td>
                        <td><Link href={`/dashboard/inventory/${it.id}`} className="font-medium hover:underline">{it.name}</Link>{it.sku && <div className="text-xs text-slate-500">{it.sku}</div>}</td>
                        <td className="text-slate-600">{it.category?.name ?? "—"}</td>
                        <td>{formatMoney(it.pricePerDay, business.currency)}/day</td>
                        <td className="text-slate-600">{formatMoney(it.deposit, business.currency)}</td>
                        <td className={low ? "font-medium text-amber-700" : ""}>{free} / {it.quantity}</td>
                        <td>{it.active ? <span className="text-xs text-emerald-700">Listed</span> : <span className="text-xs text-slate-500">Hidden</span>}</td>
                        <td className="text-right whitespace-nowrap">
                          <Link href={`/dashboard/inventory/${it.id}`} className="text-xs text-teal-700 hover:underline">Edit</Link>
                          <form action={deleteItem.bind(null, it.id)} className="ml-3 inline">
                            <button className="text-xs text-rose-700 hover:underline">Remove</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Card title="Categories">
          <ul className="mb-3 space-y-1 text-sm">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between">
                <span>{c.name} <span className="text-xs text-slate-400">({c._count.items})</span></span>
                <form action={deleteCategory.bind(null, c.id)}>
                  <button className="text-xs text-slate-400 hover:text-rose-700">✕</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addCategory} className="flex gap-2">
            <input name="name" placeholder="New category" className="input" required />
            <SubmitButton className="btn-secondary" pendingText="…">Add</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
