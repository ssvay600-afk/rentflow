import { requireBusiness } from "@/lib/auth";
import { appUrl } from "@/lib/stripe";
import { Card, PageHeader } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";
import { DomainCard } from "./DomainCard";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { business } = await requireBusiness();
  const url = `${appUrl()}/s/${business.slug}`;
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your public storefront, branding and business details." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SettingsForm business={business} />
        </div>
        <div className="space-y-6">
          <Card title="Your storefront">
            <p className="text-sm text-slate-600">Share this link with customers:</p>
            <a href={url} target="_blank" className="mt-2 block break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-teal-700">{url}</a>
            {business.customDomain && business.customDomainVerified && (
              <a href={`https://${business.customDomain}`} target="_blank" className="mt-2 block break-all rounded-lg bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-700">https://{business.customDomain}</a>
            )}
          </Card>
          <DomainCard business={business} />
          <Card title="Integrations">
            <ul className="space-y-2 text-sm">
              <li><span className="font-medium">Claude AI</span> — set <span className="font-mono text-xs">ANTHROPIC_API_KEY</span> {process.env.ANTHROPIC_API_KEY ? <span className="text-emerald-700">(connected)</span> : <span className="text-amber-700">(not set)</span>}</li>
              <li><span className="font-medium">Stripe</span> — set <span className="font-mono text-xs">STRIPE_SECRET_KEY</span> {process.env.STRIPE_SECRET_KEY ? <span className="text-emerald-700">(connected)</span> : <span className="text-amber-700">(simulated)</span>}</li>
              <li><span className="font-medium">Email</span> — set <span className="font-mono text-xs">SMTP_HOST</span> {process.env.SMTP_HOST ? <span className="text-emerald-700">(connected)</span> : <span className="text-amber-700">(outbox only)</span>}</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
