import type { Business, DomainPurchase } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dnsInstructions, getDomainStatus, isApexDomain, vercelDomainsConfigured } from "@/lib/domains";
import { settleDomainPurchase } from "@/lib/domain-purchases";
import { formatDate, formatMoney, slugify } from "@/lib/format";
import { Card } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { checkCustomDomain, checkDomainPurchase, removeCustomDomain } from "../actions";
import { DomainForm } from "./DomainForm";
import { DomainSearch } from "./DomainSearch";

function PurchaseStatus({ p }: { p: DomainPurchase }) {
  const tone: Record<string, string> = {
    pending_payment: "bg-slate-100 text-slate-700",
    paid: "bg-sky-100 text-sky-800",
    purchasing: "bg-sky-100 text-sky-800",
    completed: "bg-emerald-100 text-emerald-800",
    failed: "bg-rose-100 text-rose-800",
    refunded: "bg-rose-100 text-rose-800",
  };
  const label: Record<string, string> = {
    pending_payment: "Awaiting payment",
    paid: "Registering…",
    purchasing: "Registering…",
    completed: "Registered",
    failed: "Failed",
    refunded: "Refunded",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[p.status] ?? ""}`}>{label[p.status] ?? p.status}</span>;
}

export async function DomainCard({ business, ownerName, ownerEmail }: { business: Business; ownerName: string; ownerEmail: string }) {
  // Finish any registrar orders that are still in flight.
  const inFlight = await prisma.domainPurchase.findMany({ where: { businessId: business.id, status: { in: ["paid", "purchasing"] } } });
  for (const p of inFlight) await settleDomainPurchase(p.id, 4_000);
  const purchases = await prisma.domainPurchase.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" }, take: 5 });
  const fresh = inFlight.length ? await prisma.business.findUniqueOrThrow({ where: { id: business.id } }) : business;

  const domain = fresh.customDomain;
  const status = domain ? await getDomainStatus(domain) : null;
  const live = Boolean(status?.verified && status?.configured);
  const bought = domain ? purchases.some((p) => p.domain === domain && p.status === "completed") : false;
  const [firstName, ...rest] = ownerName.split(" ");

  return (
    <Card title="Your own domain">
      <p className="text-sm text-slate-600">
        Give your storefront its own address like <span className="font-mono">yourbusiness.com</span> instead of <span className="font-mono">/s/{fresh.slug}</span>.
      </p>

      {!domain && vercelDomainsConfigured() && (
        <div className="mt-4">
          <p className="label">Buy a new domain</p>
          <DomainSearch
            suggestion={slugify(fresh.name).replace(/-/g, "")}
            defaults={{
              firstName: firstName ?? "",
              lastName: rest.join(" "),
              email: fresh.email || ownerEmail,
              phone: fresh.phone,
              address1: fresh.address,
              city: "",
              state: "",
              zip: "",
              country: fresh.country,
            }}
          />
        </div>
      )}

      {purchases.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {purchases.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span>
                <span className="font-mono">{p.domain}</span> <span className="text-slate-400">· {formatMoney(p.price, "USD")} · {formatDate(p.createdAt)}</span>
                {p.error && <span className="block text-xs text-rose-700">{p.error}</span>}
                {p.status === "completed" && p.expiresAt && <span className="block text-xs text-slate-500">Expires {formatDate(p.expiresAt)}</span>}
              </span>
              <span className="flex items-center gap-2">
                <PurchaseStatus p={p} />
                {(p.status === "paid" || p.status === "purchasing") && (
                  <form action={checkDomainPurchase.bind(null, p.id)}><SubmitButton className="btn-secondary px-2 py-1 text-xs" pendingText="…">Check</SubmitButton></form>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <p className="label">{domain ? "Connected domain" : "Or connect a domain you already own"}</p>
        <DomainForm current={domain} />
      </div>

      {domain && (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 text-sm">
            {live ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Live</span>
            ) : status?.registered ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">{bought ? "Activating…" : "Waiting for DNS"}</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">Pending setup</span>
            )}
            <a href={`https://${domain}`} target="_blank" className="font-mono text-teal-700 hover:underline">{domain}</a>
          </p>

          {!live && !bought && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700">Add this record at your domain registrar (DNS settings):</p>
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
                DNS changes can take up to a few hours. HTTPS is issued automatically once the record is found.
                {isApexDomain(domain) && <> Tip: also connect <span className="font-mono">www.{domain}</span> if customers type it.</>}
              </p>
            </div>
          )}
          {!live && bought && (
            <p className="text-xs text-slate-500">Your new domain is registered and being activated. This usually takes a few minutes; HTTPS is set up automatically.</p>
          )}
          {!vercelDomainsConfigured() && (
            <p className="text-xs text-amber-700">Automatic registration isn&apos;t configured on this install; the RentFlow team will attach your domain within one business day.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <form action={checkCustomDomain}><SubmitButton className="btn-secondary" pendingText="Checking…">Check status</SubmitButton></form>
            <form action={removeCustomDomain}><SubmitButton className="btn-danger" pendingText="Removing…">Disconnect domain</SubmitButton></form>
          </div>
        </div>
      )}
    </Card>
  );
}
