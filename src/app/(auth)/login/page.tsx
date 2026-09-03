import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "../AuthForm";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.business ? "/dashboard" : "/onboarding");
  return <AuthForm mode="login" action={login} />;
}
