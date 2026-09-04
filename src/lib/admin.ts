import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./auth";

/** Platform admins: users flagged in the database, or listed in PLATFORM_ADMIN_EMAILS. */
export function isPlatformAdmin(user: { email: string; isPlatformAdmin: boolean } | null | undefined) {
  if (!user) return false;
  if (user.isPlatformAdmin) return true;
  const allow = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(user.email.toLowerCase());
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user)) redirect("/dashboard");
  return user;
}
