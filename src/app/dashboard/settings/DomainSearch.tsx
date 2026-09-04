"use client";

import { useActionState, useState } from "react";
import { formatMoney } from "@/lib/format";
import { searchDomainsAction, startDomainPurchase, type ActionState, type DomainSearchState } from "../actions";

export type RegistrantDefaults = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export function DomainSearch({ defaults, suggestion }: { defaults: RegistrantDefaults; suggestion: string }) {
  const [search, searchAction, searching] = useActionState(searchDomainsAction, {} as DomainSearchState);
  const [buy, buyAction, buying] = useActionState(startDomainPurchase, {} as ActionState);
  const [chosen, setChosen] = useState<{ domain: string; price: number; renewal: number } | null>(null);

  return (
    <div className="space-y-4">
      <form action={searchAction} className="flex gap-2">
        <input name="query" defaultValue={search.query ?? suggestion} placeholder="yourbusiness or yourbusiness.com" className="input" required />
        <button type="submit" disabled={searching} className="btn-primary whitespace-nowrap">{searching ? "Searching…" : "Search"}</button>
      </form>
      {search.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{search.error}</p>}

      {search.results && search.results.length > 0 && !chosen && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {search.results.map((r) => (
            <li key={r.domain} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className={r.available ? "font-medium" : "text-slate-400 line-through"}>{r.domain}</span>
              {r.available ? (
                <span className="flex items-center gap-3">
                  <span className="text-slate-600">{formatMoney(r.price, "USD")}<span className="text-xs text-slate-400">/yr</span></span>
                  <button type="button" className="btn-secondary px-3 py-1" onClick={() => setChosen({ domain: r.domain, price: r.price, renewal: r.renewalPrice })}>Buy</button>
                </span>
              ) : (
                <span className="text-xs text-slate-400">Taken</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <form action={buyAction} className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/40 p-4">
          <input type="hidden" name="domain" value={chosen.domain} />
          <div className="flex items-center justify-between">
            <p className="font-medium">{chosen.domain}</p>
            <button type="button" onClick={() => setChosen(null)} className="text-xs text-slate-500 hover:underline">Choose another</button>
          </div>
          <p className="text-sm text-slate-600">
            {formatMoney(chosen.price, "USD")} for 1 year. Registered in your name and connected to your storefront automatically, no DNS setup needed.
          </p>
          {buy.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{buy.error}</p>}
          <p className="label">Registrant details (required by the domain registry)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="firstName" defaultValue={defaults.firstName} placeholder="First name" className="input" required />
            <input name="lastName" defaultValue={defaults.lastName} placeholder="Last name" className="input" required />
            <input name="email" type="email" defaultValue={defaults.email} placeholder="Email" className="input" required />
            <input name="phone" type="tel" defaultValue={defaults.phone} placeholder="Phone" className="input" required />
            <input name="address1" defaultValue={defaults.address1} placeholder="Street address" className="input sm:col-span-2" required />
            <input name="address2" placeholder="Apt / suite (optional)" className="input sm:col-span-2" />
            <input name="city" defaultValue={defaults.city} placeholder="City" className="input" required />
            <input name="state" defaultValue={defaults.state} placeholder="State / region" className="input" required />
            <input name="zip" defaultValue={defaults.zip} placeholder="ZIP / postal code" className="input" required />
            <input name="country" defaultValue={defaults.country} placeholder="Country (ISO code, e.g. US)" maxLength={2} className="input uppercase" required />
          </div>
          <button type="submit" disabled={buying} className="btn-primary w-full">
            {buying ? "Opening checkout…" : `Pay ${formatMoney(chosen.price, "USD")} and register`}
          </button>
          <p className="text-xs text-slate-500">
            Registration is for 1 year; renews at about {formatMoney(Math.ceil((chosen.renewal * 1.25) / 50) * 50, "USD")}/yr, and we&apos;ll remind you before it expires. If registration fails after payment, you&apos;re refunded automatically.
          </p>
        </form>
      )}
    </div>
  );
}
