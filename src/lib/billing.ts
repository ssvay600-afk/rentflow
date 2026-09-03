import type { Business } from "@prisma/client";
import { PLANS, stripeEnabled } from "./stripe";

export type BillingState = {
  kind: "demo" | "trial" | "active" | "past_due" | "locked";
  label: string;
  daysLeft: number;
};

/** Billing is only enforced when Stripe and at least one plan price are configured. */
export function billingEnforced() {
  return stripeEnabled() && Boolean(PLANS.starter.priceId || PLANS.pro.priceId);
}

export function billingState(business: Business): BillingState {
  const daysLeft = business.trialEndsAt ? Math.ceil((business.trialEndsAt.getTime() - Date.now()) / 86_400_000) : 0;
  if (!billingEnforced()) return { kind: "demo", label: "Demo mode – billing not configured", daysLeft };
  const status = business.subscriptionStatus;
  if (status === "active" || status === "trialing") {
    return { kind: "active", label: `${business.planKey ? PLANS[business.planKey as keyof typeof PLANS]?.name ?? business.planKey : "Plan"} · ${status}`, daysLeft };
  }
  if (status === "past_due" || status === "unpaid") return { kind: "past_due", label: "Payment failed – update your card", daysLeft };
  if (daysLeft > 0) return { kind: "trial", label: `Free trial · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`, daysLeft };
  return { kind: "locked", label: "Trial ended – choose a plan to continue", daysLeft: 0 };
}
