"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { slugify } from "@/lib/format";

export type OnboardingState = { error?: string };

const DEFAULT_POLICIES = `Hours: Mon–Sat 9am–6pm, closed Sunday.
Pickup & return: Bring a photo ID at pickup. Returns are due by closing time on the return date.
Deposits: Refundable deposits are released within 3 business days after the item is returned undamaged.
Late returns: Charged one extra day per day late.
Cancellations: Free cancellation up to 48 hours before pickup; 50% fee after that.`;

export async function createBusiness(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser();
  if (user.business) redirect("/dashboard");

  const name = String(formData.get("name") ?? "").trim();
  const slug = slugify(String(formData.get("slug") ?? "") || name);
  const tagline = String(formData.get("tagline") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD").toUpperCase();

  if (!name) return { error: "Business name is required." };
  if (slug.length < 3) return { error: "Storefront link must be at least 3 characters." };
  if (await prisma.business.findUnique({ where: { slug } })) return { error: "That storefront link is taken." };

  await prisma.business.create({
    data: {
      ownerId: user.id,
      name,
      slug,
      tagline,
      email: email || user.email,
      phone,
      currency,
      policies: DEFAULT_POLICIES,
      categories: { create: [{ name: "General" }] },
    },
  });
  redirect("/dashboard?welcome=1");
}
