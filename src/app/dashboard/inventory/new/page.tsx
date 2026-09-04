import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ItemForm } from "../ItemForm";
import { uploadsConfigured } from "@/lib/uploads";

export const metadata = { title: "Add item" };

export default async function NewItemPage() {
  const { business } = await requireBusiness();
  const categories = await prisma.category.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader title="Add item" />
      <ItemForm categories={categories} uploadsEnabled={uploadsConfigured()} />
    </div>
  );
}
