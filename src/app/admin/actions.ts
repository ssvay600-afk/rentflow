"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { syncAccountStatus } from "@/lib/stripe";

function refresh() {
  revalidatePath("/admin", "layout");
}

export async function toggleSuspended(businessId: string) {
  await requireAdmin();
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  await prisma.business.update({ where: { id: businessId }, data: { suspended: !business.suspended } });
  refresh();
  revalidatePath(`/s/${business.slug}`, "layout");
  revalidatePath("/dashboard", "layout");
}

export async function saveAdminNotes(businessId: string, formData: FormData) {
  await requireAdmin();
  await prisma.business.update({ where: { id: businessId }, data: { adminNotes: String(formData.get("adminNotes") ?? "") } });
  refresh();
}

export async function syncBusinessStripe(businessId: string) {
  await requireAdmin();
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  if (business.stripeAccountId) await syncAccountStatus(business);
  refresh();
}

export async function setPlatformAdmin(userId: string, value: boolean) {
  const me = await requireAdmin();
  if (userId === me.id && !value) throw new Error("You can't remove your own admin access");
  await prisma.user.update({ where: { id: userId }, data: { isPlatformAdmin: value } });
  refresh();
}
