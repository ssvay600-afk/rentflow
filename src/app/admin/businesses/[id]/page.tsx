import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { subscriptionLabel, subscriptionTone } from "@/lib/admin-stats";
import { PLATFORM_FEE_PERCENT } from "@/lib/stripe";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { saveAdminNotes, syncBusinessStripe, toggleSuspended } from "../../actions";

export default async function AdminBusinessDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      owner: true,
      _count: { select: { items: true, customers: true, orders: true, conversations: true } },
      orders: { include: { customer: true, payments: true }, orderBy: { createdAt: "desc" }, take: 10 },
      payments: { where: { status: "paid" }, select: { amount: true, applicationFee: true, method: true } },
    },
  });
  if (!business) notFound();
  const volume = business.payments.reduce((s, p) => s + p.amount, 0);
  const fees = business.payments.reduce((s, p) => s + p.applicationFee, 0);
  const stripeVolume = business.payments.filter((p) => p.method === "stripe").reduce((s, p) => s + p.amount, 0);
  const isTest = business.stripeAccountId ? "/test" : "";

  return (
    <div>
      <PageHeader
        title={business.name}
        subtitle={`Owner ${business.owner.name} · ${business.owner.email} · joined ${formatDate(business.createdAt)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/s/${business.slug}`} target="_blank" className="btn-secondary">Storefront ↗</Link>
            <form action={toggleSuspended.bind(null, business.id)}>
              <SubmitButton className={business.suspended ? "btn-primary" : "btn-danger"} pendingText="…">{business.suspended ? "Unsuspend" : "Suspend business"}</SubmitButton>
            </form>
          </div>
        }
      />
      {business.suspended && (
        <p className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Suspended: the storefront shows an unavailable notice, checkout is blocked, and the owner sees a suspension screen in their dashboard.
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Orders" value={String(business._count.orders)} hint={`${business._count.items} items · ${business._count.customers} customers`} />
        <Stat label="Paid volume" value={formatMoney(volume, business.currency)} hint={`${formatMoney(stripeVolume, business.currency)} via Stripe`} />
        <Stat label="Platform fees" value={formatMoney(fees, business.currency)} hint={`${PLATFORM_FEE_PERCENT}% of Stripe payments`} />
        <Stat label="Bot conversations" value={String(business._count.conversations)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Recent orders">
            {business.orders.length === 0 ? (
              <p className="text-sm text-slate-500">No orders yet.</p>
            ) : (
              <table className="table">
                <thead><tr><th>#</th><th>Customer</th><th>Dates</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {business.orders.map((o) => (
                    <tr key={o.id}>
                      <td>#{o.orderNumber}<div className="text-xs text-slate-400">{o.source}</div></td>
                      <td>{o.customer.name}</td>
                      <td className="text-slate-600">{formatDate(o.startDate)} → {formatDate(o.endDate)}</td>
                      <td>{formatMoney(o.total, business.currency)}</td>
                      <td><Badge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Admin notes">
            <form action={saveAdminNotes.bind(null, business.id)} className="space-y-2">
              <textarea name="adminNotes" defaultValue={business.adminNotes} rows={4} className="input" placeholder="Internal notes about this business (not visible to the owner)." />
              <SubmitButton className="btn-secondary">Save notes</SubmitButton>
            </form>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Subscription">
            <Badge status={subscriptionTone(business.subscriptionStatus, business.trialEndsAt)}>{subscriptionLabel(business)}</Badge>
            <dl className="mt-3 space-y-1 text-sm text-slate-600">
              {business.subscriptionId && <div><dt className="text-xs uppercase text-slate-400">Subscription</dt><dd className="font-mono text-xs">{business.subscriptionId}</dd></div>}
              {business.currentPeriodEnd && <div><dt className="text-xs uppercase text-slate-400">Renews</dt><dd>{formatDate(business.currentPeriodEnd)}</dd></div>}
              {business.trialEndsAt && <div><dt className="text-xs uppercase text-slate-400">Trial ends</dt><dd>{formatDate(business.trialEndsAt)}</dd></div>}
            </dl>
            {business.subscriptionId && (
              <a href={`https://dashboard.stripe.com${isTest}/subscriptions/${business.subscriptionId}`} target="_blank" className="mt-3 block text-xs text-teal-700 hover:underline">Open in Stripe ↗</a>
            )}
          </Card>
          <Card title="Stripe Connect">
            {business.stripeAccountId ? (
              <>
                <p className="text-sm">{business.stripeChargesEnabled ? <span className="text-emerald-700">● Card payments active</span> : <span className="text-amber-700">● Onboarding incomplete</span>}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{business.stripeAccountId}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`https://dashboard.stripe.com${isTest}/connect/accounts/${business.stripeAccountId}`} target="_blank" className="btn-secondary">Open account ↗</a>
                  <form action={syncBusinessStripe.bind(null, business.id)}><SubmitButton className="btn-secondary" pendingText="…">Sync status</SubmitButton></form>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Not connected. Rental payments fall back to “pay at pickup”.</p>
            )}
          </Card>
          <Card title="Details">
            <dl className="space-y-1 text-sm text-slate-600">
              <div><dt className="text-xs uppercase text-slate-400">Storefront</dt><dd>/s/{business.slug}</dd></div>
              {business.customDomain && (
                <div><dt className="text-xs uppercase text-slate-400">Custom domain</dt><dd><a href={`https://${business.customDomain}`} target="_blank" className="text-teal-700 hover:underline">{business.customDomain}</a> · {business.customDomainVerified ? <span className="text-emerald-700">live</span> : <span className="text-amber-700">pending DNS</span>}</dd></div>
              )}
              <div><dt className="text-xs uppercase text-slate-400">Contact</dt><dd>{business.email || "—"} {business.phone && `· ${business.phone}`}</dd></div>
              <div><dt className="text-xs uppercase text-slate-400">Country / currency</dt><dd>{business.country} · {business.currency}</dd></div>
              <div><dt className="text-xs uppercase text-slate-400">Bot</dt><dd>{business.botEnabled ? "Enabled" : "Disabled"}</dd></div>
              <div><dt className="text-xs uppercase text-slate-400">Reminders</dt><dd>{business.autoSendReminders ? "Auto-send" : "Manual approval"} · {business.remindBeforeDays}d ahead</dd></div>
              <div><dt className="text-xs uppercase text-slate-400">Last updated</dt><dd>{formatDateTime(business.updatedAt)}</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
