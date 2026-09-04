"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import {
  PLANS,
  changeSubscriptionPlan,
  createPortalSession,
  createSubscriptionCheckout,
  hasLiveSubscription,
  type PlanKey,
} from "@/lib/stripe";

export async function startSubscription(planKey: string) {
  const { business } = await requireBusiness();
  if (!(planKey in PLANS)) throw new Error("Unknown plan");
  // Already subscribed: change the plan on the existing subscription rather
  // than creating a second one through Checkout.
  if (hasLiveSubscription(business)) {
    await changeSubscriptionPlan(business, planKey as PlanKey);
    revalidatePath("/billing");
    revalidatePath("/dashboard", "layout");
    redirect("/billing?changed=1");
  }
  const session = await createSubscriptionCheckout(business, planKey as PlanKey);
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  redirect(session.url);
}

export async function openBillingPortal() {
  const { business } = await requireBusiness();
  const session = await createPortalSession(business);
  redirect(session.url);
}
