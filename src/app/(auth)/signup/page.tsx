import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "../AuthForm";
import { signup } from "../actions";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.business ? "/dashboard" : "/onboarding");
  return <AuthForm mode="signup" action={signup} />;
}
