import type { Business } from "@prisma/client";
import { dnsInstructions, getDomainStatus, isApexDomain, vercelDomainsConfigured } from "@/lib/domains";
import { Card } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { checkCustomDomain, removeCustomDomain } from "../actions";
import { DomainForm } from "./DomainForm";

const REGISTRARS = [
  { name: "Namecheap", url: "https://www.namecheap.com/domains/" },
  { name: "Cloudflare Registrar", url: "https://www.cloudflare.com/products/registrar/" },
  { name: "Porkbun", url: "https://porkbun.com/" },
];

export async function DomainCard({ business }: { business: Business }) {
  const domain = business.customDomain;
  const status = domain ? await getDomainStatus(domain) : null;
  const live = Boolean(status?.verified && status?.configured);

  return (
    <Card title="Your own domain">
      <p className="text-sm text-slate-600">
        Put your storefront on a domain you own, like <span className="font-mono">www.yourbusiness.com</span>, instead of <span className="font-mono">/s/{business.slug}</span>.
      </p>

      <div className="mt-4">
        <DomainForm current={domain} />
      </div>

      {!domain ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Don&apos;t have a domain yet?</p>
          <p className="mt-1">Buy one (usually $10–15/year) from any registrar, then come back and connect it:</p>
          <p className="mt-1 flex flex-wrap gap-3">
            {REGISTRARS.map((r) => (
              <a key={r.name} href={r.url} target="_blank" className="text-teal-700 hover:underline">{r.name} ↗</a>
            ))}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 text-sm">
            {live ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Live</span>
            ) : status?.registered ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Waiting for DNS</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">Pending setup</span>
            )}
            <a href={`https://${domain}`} target="_blank" className="font-mono text-teal-700 hover:underline">{domain}</a>
          </p>

          {!live && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700">Add {isApexDomain(domain) ? "this record" : "this record"} at your domain registrar (DNS settings):</p>
              <table className="mt-2 w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Type</th><th className="py-1">Name / host</th><th className="py-1">Value</th></tr></thead>
                <tbody className="font-mono">
                  {dnsInstructions(domain).map((r) => (
                    <tr key={r.type + r.name}><td className="py-1">{r.type}</td><td className="py-1">{r.name}</td><td className="py-1 break-all">{r.value}</td></tr>
                  ))}
                  {status?.verification.map((v) => (
                    <tr key={v.value}><td className="py-1">{v.type}</td><td className="py-1 break-all">{v.domain}</td><td className="py-1 break-all">{v.value}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">
                DNS changes can take up to a few hours to propagate. Vercel issues the HTTPS certificate automatically once the record is found.
                {isApexDomain(domain) && <> Tip: also connect <span className="font-mono">www.{domain}</span> if customers type it.</>}
              </p>
              {!vercelDomainsConfigured() && (
                <p className="mt-2 text-xs text-amber-700">Automatic registration isn&apos;t configured on this install; the RentFlow team will attach your domain within one business day.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <form action={checkCustomDomain}><SubmitButton className="btn-secondary" pendingText="Checking…">Check status</SubmitButton></form>
            <form action={removeCustomDomain}><SubmitButton className="btn-danger" pendingText="Removing…">Remove domain</SubmitButton></form>
          </div>
        </div>
      )}
    </Card>
  );
}
