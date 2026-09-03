import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Set up your business" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.business) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your rental business</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        This creates your storefront and dashboard. You can change everything later in Settings.
      </p>
      <OnboardingForm defaultEmail={user.email} />
    </main>
  );
}
