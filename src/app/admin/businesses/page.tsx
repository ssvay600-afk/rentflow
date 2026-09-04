import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { listBusinesses, subscriptionLabel, subscriptionTone } from "@/lib/admin-stats";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { toggleSuspended } from "../actions";

export const metadata = { title: "Businesses" };

export default async function AdminBusinesses({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const businesses = await listBusinesses(q);
  return (
    <div>
      <PageHeader
        title="Businesses"
        subtitle={`${businesses.length} rental business${businesses.length === 1 ? "" : "es"} on the platform.`}
        action={<form><input name="q" defaultValue={q} placeholder="Search name, slug or owner" className="input w-64" /></form>}
      />
      {businesses.length === 0 ? (
        <EmptyState title="No businesses match" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Business</th><th>Owner</th><th>Plan</th><th>Stripe</th><th>Orders</th><th>Rental volume</th><th>Fees earned</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id} className={b.suspended ? "bg-rose-50/50" : ""}>
                  <td>
                    <Link href={`/admin/businesses/${b.id}`} className="font-medium text-teal-700 hover:underline">{b.name}</Link>
                    <div className="text-xs text-slate-400">/s/{b.slug}{b.suspended && <span className="ml-2 rounded bg-rose-100 px-1.5 text-rose-700">suspended</span>}</div>
                  </td>
                  <td className="text-slate-600">{b.ownerEmail}</td>
                  <td><Badge status={subscriptionTone(b.subscriptionStatus, b.trialEndsAt)}>{subscriptionLabel(b)}</Badge></td>
                  <td className="text-xs">{b.stripeChargesEnabled ? <span className="text-emerald-700">Active</span> : b.stripeAccountId ? <span className="text-amber-700">Onboarding</span> : <span className="text-slate-400">—</span>}</td>
                  <td>{b.orders}</td>
                  <td>{formatMoney(b.rentalVolume, b.currency)}</td>
                  <td className="text-slate-600">{formatMoney(b.platformFees, b.currency)}</td>
                  <td className="whitespace-nowrap text-slate-500">{formatDate(b.createdAt)}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/s/${b.slug}`} target="_blank" className="text-xs text-teal-700 hover:underline">Storefront ↗</Link>
                    <form action={toggleSuspended.bind(null, b.id)} className="ml-3 inline">
                      <button className={`text-xs hover:underline ${b.suspended ? "text-emerald-700" : "text-rose-700"}`}>{b.suspended ? "Unsuspend" : "Suspend"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
