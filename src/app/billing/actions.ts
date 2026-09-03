"use server";

import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { PLANS, createPortalSession, createSubscriptionCheckout, type PlanKey } from "@/lib/stripe";

export async function startSubscription(planKey: string) {
  const { business } = await requireBusiness();
  if (!(planKey in PLANS)) throw new Error("Unknown plan");
  const session = await createSubscriptionCheckout(business, planKey as PlanKey);
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  redirect(session.url);
}

export async function openBillingPortal() {
  const { business } = await requireBusiness();
  const session = await createPortalSession(business);
  redirect(session.url);
}
