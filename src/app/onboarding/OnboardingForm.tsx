"use client";

import { useActionState, useState } from "react";
import { createBusiness, type OnboardingState } from "./actions";
import { slugify } from "@/lib/format";

export function OnboardingForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, formAction, pending] = useActionState(createBusiness, {} as OnboardingState);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <form action={formAction} className="card space-y-5 p-6">
      {state.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <label className="block">
        <span className="label">Business name</span>
        <input name="name" required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Peak Gear Rentals" />
      </label>
      <label className="block">
        <span className="label">Storefront link</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">/s/</span>
          <input
            name="slug"
            className="input"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="peak-gear"
          />
        </div>
      </label>
      <label className="block">
        <span className="label">Tagline</span>
        <input name="tagline" className="input" placeholder="Camping & outdoor gear, ready when you are" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="label">Contact email</span>
          <input name="email" type="email" className="input" defaultValue={defaultEmail} />
        </label>
        <label className="block">
          <span className="label">Phone</span>
          <input name="phone" className="input" placeholder="+1 555 010 2030" />
        </label>
      </div>
      <label className="block">
        <span className="label">Currency</span>
        <select name="currency" className="input" defaultValue="USD">
          {["USD", "EUR", "GBP", "CAD", "AUD", "INR", "NPR"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating…" : "Create my storefront"}
      </button>
    </form>
  );
}
