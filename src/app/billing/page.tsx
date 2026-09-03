import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { billingEnforced, billingState } from "@/lib/billing";
import { formatDate, formatMoney } from "@/lib/format";
import { PLANS, TRIAL_DAYS, type PlanKey } from "@/lib/stripe";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { openBillingPortal, startSubscription } from "./actions";

export const metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const { business } = await requireBusiness();
  const { success } = await searchParams;
  const state = billingState(business);
  const subscribed = state.kind === "active" || state.kind === "past_due";

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-teal-700 hover:underline">← Back to dashboard</Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Your RentFlow plan</h1>
      <p className="mt-1 text-slate-600">{business.name} · {state.label}</p>

      {success && (
        <div className="mt-6">
          <Alert tone="success">Thanks! Your subscription is being activated. This page updates as soon as Stripe confirms it.</Alert>
        </div>
      )}
      {!billingEnforced() && (
        <div className="mt-6">
          <Alert tone="info">
            Billing isn&apos;t enforced on this install: Stripe plan prices aren&apos;t configured. Run <span className="font-mono">npm run stripe:setup</span> and set{" "}
            <span className="font-mono">STRIPE_PRICE_STARTER</span> / <span className="font-mono">STRIPE_PRICE_PRO</span>.
          </Alert>
        </div>
      )}

      {subscribed && (
        <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="font-medium">{business.planKey ? PLANS[business.planKey as PlanKey]?.name : "Plan"} · {business.subscriptionStatus}</p>
            {business.currentPeriodEnd && <p className="text-sm text-slate-500">Renews {formatDate(business.currentPeriodEnd)}</p>}
          </div>
          <form action={openBillingPortal}>
            <SubmitButton className="btn-secondary" pendingText="Opening…">Manage subscription, invoices & card</SubmitButton>
          </form>
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {(Object.keys(PLANS) as PlanKey[]).map((key) => {
          const plan = PLANS[key];
          const current = business.planKey === key && subscribed;
          return (
            <div key={key} className={`card p-6 ${current ? "ring-2 ring-teal-600" : ""}`}>
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="text-sm text-slate-500">{plan.description}</p>
              <p className="mt-4 text-3xl font-semibold">
                {formatMoney(plan.amount, "USD")}<span className="text-base font-normal text-slate-500">/month</span>
              </p>
              <ul className="mt-4 space-y-1 text-sm text-slate-600">
                {plan.features.map((f) => <li key={f}>• {f}</li>)}
              </ul>
              <div className="mt-6">
                {current ? (
                  <span className="btn-secondary w-full cursor-default">Current plan</span>
                ) : (
                  <form action={startSubscription.bind(null, key)}>
                    <SubmitButton className="btn-primary w-full" pendingText="Opening checkout…">
                      {subscribed ? `Switch to ${plan.name}` : state.daysLeft > 0 ? `Start ${plan.name} (trial continues)` : `Choose ${plan.name}`}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-slate-500">
        New businesses get a {TRIAL_DAYS}-day free trial. Subscribing during the trial keeps the remaining trial days before the first charge. Cancel any time from the billing portal.
      </p>
    </main>
  );
}
