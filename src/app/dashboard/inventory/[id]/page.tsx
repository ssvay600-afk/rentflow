import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ItemForm } from "../ItemForm";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { business } = await requireBusiness();
  const { id } = await params;
  const [item, categories] = await Promise.all([
    prisma.item.findFirst({ where: { id, businessId: business.id } }),
    prisma.category.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } }),
  ]);
  if (!item) notFound();
  const bookings = await prisma.orderItem.findMany({
    where: { itemId: item.id, order: { status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] } } },
    include: { order: { include: { customer: true } } },
    orderBy: { order: { startDate: "asc" } },
  });

  return (
    <div>
      <PageHeader title={item.name} subtitle="Edit item details and see upcoming bookings." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ItemForm item={item} categories={categories} />
        </div>
        <Card title="Upcoming bookings">
          {bookings.length === 0 ? (
            <p className="text-sm text-slate-500">No open bookings.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {bookings.map((b) => (
                <li key={b.id} className="py-2">
                  <div className="flex items-center justify-between">
                    <Link href={`/dashboard/orders/${b.orderId}`} className="font-medium hover:underline">#{b.order.orderNumber} · {b.quantity}×</Link>
                    <Badge status={b.order.status} />
                  </div>
                  <p className="text-xs text-slate-500">{formatDateRange(b.order.startDate, b.order.endDate)} · {b.order.customer.name}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
