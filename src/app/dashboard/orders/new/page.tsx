import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { NewOrderForm } from "./NewOrderForm";

export const metadata = { title: "New order" };

export default async function NewOrderPage() {
  const { business } = await requireBusiness();
  const items = await prisma.item.findMany({
    where: { businessId: business.id, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, pricePerDay: true, deposit: true, quantity: true, minDays: true },
  });
  return (
    <div>
      <PageHeader title="New order" subtitle="Create a booking on behalf of a customer (phone or walk-in)." />
      <NewOrderForm items={items} currency={business.currency} taxRate={business.taxRate} />
    </div>
  );
}
