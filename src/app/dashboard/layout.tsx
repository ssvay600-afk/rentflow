import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { billingState } from "@/lib/billing";
import { isPlatformAdmin } from "@/lib/admin";
import { logout } from "@/app/(auth)/actions";
import { Nav } from "./Nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBusiness();
  const billing = billingState(business);
  const [pendingOrders, draftReminders, escalated] = await Promise.all([
    prisma.order.count({ where: { businessId: business.id, status: "PENDING" } }),
    prisma.reminder.count({ where: { businessId: business.id, status: { in: ["draft", "failed"] } } }),
    prisma.conversation.count({ where: { businessId: business.id, escalated: true } }),
  ]);

  const banner =
    billing.kind === "trial" ? (
      <Link href="/billing" className="block bg-teal-700 px-4 py-2 text-center text-sm text-white hover:bg-teal-800">
        {billing.label} · Choose a plan →
      </Link>
    ) : billing.kind === "past_due" ? (
      <Link href="/billing" className="block bg-rose-600 px-4 py-2 text-center text-sm text-white hover:bg-rose-700">
        {billing.label} →
      </Link>
    ) : null;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/" className="px-3 text-lg font-semibold tracking-tight text-teal-800">
          RentFlow
        </Link>
        <div className="mt-1 mb-6 px-3 text-xs text-slate-500">{business.name}</div>
        <Nav
          badges={{
            "/dashboard/orders": pendingOrders,
            "/dashboard/reminders": draftReminders,
            "/dashboard/bot": escalated,
          }}
        />
        <div className="mt-auto space-y-2 px-3 pt-6">
          {isPlatformAdmin(user) && (
            <Link href="/admin" className="block rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-medium text-white hover:bg-slate-800">
              Platform admin →
            </Link>
          )}
          <Link href="/billing" className="block text-xs text-slate-500 hover:text-slate-800">
            Plan: {billing.label}
          </Link>
          <Link href={`/s/${business.slug}`} target="_blank" className="block text-sm text-teal-700 hover:underline">
            View storefront ↗
          </Link>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <form action={logout}>
            <button className="text-xs text-slate-500 hover:text-slate-800">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="flex-1">
        {banner}
        <div className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="font-semibold text-teal-800">
              RentFlow
            </Link>
            <Link href={`/s/${business.slug}`} className="text-sm text-teal-700">
              Storefront ↗
            </Link>
          </div>
          <div className="mt-2 overflow-x-auto">
            <Nav badges={{}} />
          </div>
        </div>
        <main className="mx-auto max-w-6xl p-4 md:p-8">
          {business.suspended ? (
            <div className="mx-auto max-w-lg py-16 text-center">
              <h1 className="text-2xl font-semibold">This business has been suspended</h1>
              <p className="mt-2 text-slate-600">
                Your storefront and dashboard are paused by the RentFlow team. Please contact support to resolve this.
              </p>
            </div>
          ) : billing.kind === "locked" ? (
            <div className="mx-auto max-w-lg py-16 text-center">
              <h1 className="text-2xl font-semibold">Your free trial has ended</h1>
              <p className="mt-2 text-slate-600">
                Your storefront stays online and customers can still book. Pick a plan to keep managing orders, inventory, reminders and the support bot.
              </p>
              <Link href="/billing" className="btn-primary mt-6 px-6 py-3">
                Choose a plan
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
