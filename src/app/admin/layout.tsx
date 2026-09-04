import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { logout } from "@/app/(auth)/actions";
import { AdminNav } from "./AdminNav";

export const metadata = { title: { default: "Platform admin", template: "%s · RentFlow admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-4 bg-slate-900 p-4 text-white md:w-60">
        <div>
          <Link href="/" className="text-lg font-semibold tracking-tight">RentFlow</Link>
          <p className="text-xs text-slate-400">Platform admin</p>
        </div>
        <AdminNav />
        <div className="mt-auto space-y-2 text-xs text-slate-400">
          {user.business && (
            <Link href="/dashboard" className="block text-teal-300 hover:underline">My business dashboard →</Link>
          )}
          <p className="truncate">{user.email}</p>
          <form action={logout}><button className="hover:text-white">Sign out</button></form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
