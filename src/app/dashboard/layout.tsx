import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logout } from "@/app/(auth)/actions";
import { Nav } from "./Nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBusiness();
  const [pendingOrders, draftReminders, escalated] = await Promise.all([
    prisma.order.count({ where: { businessId: business.id, status: "PENDING" } }),
    prisma.reminder.count({ where: { businessId: business.id, status: { in: ["draft", "failed"] } } }),
    prisma.conversation.count({ where: { businessId: business.id, escalated: true } }),
  ]);

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
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
