import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin, isPlatformAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { setPlatformAdmin } from "../actions";

export const metadata = { title: "Users" };

export default async function AdminUsers() {
  const me = await requireAdmin();
  const users = await prisma.user.findMany({
    include: { business: { select: { id: true, name: true } }, _count: { select: { sessions: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Users" subtitle="Every account on the platform. Platform admins can see this area; owners only see their own business." />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Business</th><th>Role</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => {
              const admin = isPlatformAdmin(u);
              return (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td className="text-slate-600">{u.email}</td>
                  <td>{u.business ? <Link href={`/admin/businesses/${u.business.id}`} className="text-teal-700 hover:underline">{u.business.name}</Link> : <span className="text-slate-400">— (no business yet)</span>}</td>
                  <td>{admin ? <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-white">Platform admin</span> : <span className="text-xs text-slate-500">Owner</span>}</td>
                  <td className="text-slate-500">{formatDate(u.createdAt)}</td>
                  <td className="text-right">
                    {u.id !== me.id && (
                      <form action={setPlatformAdmin.bind(null, u.id, !u.isPlatformAdmin)}>
                        <button className="text-xs text-teal-700 hover:underline">{u.isPlatformAdmin ? "Revoke admin" : "Make admin"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
