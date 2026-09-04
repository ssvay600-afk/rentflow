import { prisma } from "./db";
import { PLANS, type PlanKey } from "./stripe";

export type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  createdAt: Date;
  suspended: boolean;
  planKey: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  orders: number;
  rentalVolume: number; // cents, paid
  platformFees: number; // cents
  currency: string;
};

export async function listBusinesses(q?: string): Promise<BusinessRow[]> {
  const businesses = await prisma.business.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { owner: { email: { contains: q, mode: "insensitive" } } }] }
      : {},
    include: {
      owner: { select: { email: true } },
      _count: { select: { orders: true } },
      payments: { where: { status: "paid" }, select: { amount: true, applicationFee: true, method: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return businesses.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    ownerEmail: b.owner.email,
    createdAt: b.createdAt,
    suspended: b.suspended,
    planKey: b.planKey,
    subscriptionStatus: b.subscriptionStatus,
    trialEndsAt: b.trialEndsAt,
    stripeAccountId: b.stripeAccountId,
    stripeChargesEnabled: b.stripeChargesEnabled,
    orders: b._count.orders,
    rentalVolume: b.payments.reduce((s, p) => s + p.amount, 0),
    platformFees: b.payments.reduce((s, p) => s + p.applicationFee, 0),
    currency: b.currency,
  }));
}

export function planMrr(planKey: string | null | undefined, status: string | null | undefined) {
  if (!planKey || status !== "active") return 0;
  return PLANS[planKey as PlanKey]?.amount ?? 0;
}

export function subscriptionLabel(b: { planKey: string | null; subscriptionStatus: string | null; trialEndsAt: Date | null }) {
  if (b.subscriptionStatus) return `${b.planKey ? PLANS[b.planKey as PlanKey]?.name ?? b.planKey : "Plan"} · ${b.subscriptionStatus}`;
  if (b.trialEndsAt && b.trialEndsAt > new Date()) {
    const days = Math.ceil((b.trialEndsAt.getTime() - Date.now()) / 86_400_000);
    return `Free trial · ${days}d left`;
  }
  return "No plan";
}

export function subscriptionTone(status: string | null | undefined, trialEndsAt: Date | null) {
  if (status === "active" || status === "trialing") return "paid";
  if (status === "past_due" || status === "unpaid") return "failed";
  if (status === "canceled") return "refunded";
  return trialEndsAt && trialEndsAt > new Date() ? "pending" : "skipped";
}
