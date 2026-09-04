"use client";

import { useActionState } from "react";
import type { Business } from "@prisma/client";
import { saveBusinessSettings, type ActionState } from "../actions";
import { ImageField } from "@/components/ImageField";

export function SettingsForm({ business, uploadsEnabled }: { business: Business; uploadsEnabled: boolean }) {
  const [state, formAction, pending] = useActionState(saveBusinessSettings, {} as ActionState);
  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-6">
      {state.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>}

      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-slate-700">Business profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Business name</span><input name="name" defaultValue={business.name} required className="input" /></label>
          <label className="block">
            <span className="label">Storefront link</span>
            <div className="flex items-center gap-2"><span className="text-sm text-slate-500">/s/</span><input name="slug" defaultValue={business.slug} required className="input" /></div>
          </label>
        </div>
        <label className="block"><span className="label">Tagline</span><input name="tagline" defaultValue={business.tagline} className="input" /></label>
        <label className="block"><span className="label">About</span><textarea name="description" defaultValue={business.description} rows={3} className="input" placeholder="Shown on your storefront and used by the support bot." /></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block"><span className="label">Email</span><input name="email" type="email" defaultValue={business.email} className="input" /></label>
          <label className="block"><span className="label">Phone</span><input name="phone" defaultValue={business.phone} className="input" /></label>
          <label className="block"><span className="label">Currency</span><input name="currency" defaultValue={business.currency} maxLength={3} className="input uppercase" /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block sm:col-span-2"><span className="label">Address</span><input name="address" defaultValue={business.address} className="input" /></label>
          <label className="block"><span className="label">Country (ISO code)</span><input name="country" defaultValue={business.country} maxLength={2} className="input uppercase" disabled={Boolean(business.stripeAccountId)} /></label>
        </div>
      </section>

      <section className="card space-y-5 p-6">
        <h2 className="text-sm font-semibold text-slate-700">Storefront branding</h2>
        <label className="block sm:w-48"><span className="label">Brand colour</span><input name="primaryColor" type="color" defaultValue={business.primaryColor} className="input h-10 p-1" /></label>
        <ImageField name="logo" label="Logo / profile picture" current={business.logoUrl} shape="logo" placeholderText="Your initial is shown until you add a logo" hint="Square works best. JPG, PNG or WebP, up to 5 MB." uploadsEnabled={uploadsEnabled} />
        <ImageField name="hero" label="Background / cover picture" current={business.heroImageUrl} shape="wide" placeholderText="Your brand colour is shown until you add a cover picture" hint="Wide landscape photo (e.g. 1600×600). JPG, PNG or WebP, up to 5 MB." uploadsEnabled={uploadsEnabled} />
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-slate-700">Social links</h2>
        <p className="text-xs text-slate-500">Shown as icons in your storefront header and footer. Paste a full link or just your handle.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block"><span className="label">Facebook</span><input name="facebookUrl" defaultValue={business.facebookUrl} placeholder="facebook.com/yourpage" className="input" /></label>
          <label className="block"><span className="label">Instagram</span><input name="instagramUrl" defaultValue={business.instagramUrl} placeholder="@yourhandle" className="input" /></label>
          <label className="block"><span className="label">TikTok</span><input name="tiktokUrl" defaultValue={business.tiktokUrl} placeholder="@yourhandle" className="input" /></label>
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-slate-700">Pricing & inventory</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Tax rate (%)</span><input name="taxRate" type="number" step="0.01" min="0" defaultValue={business.taxRate} className="input" /></label>
          <label className="block"><span className="label">Low-stock alert at (units free)</span><input name="lowStockThreshold" type="number" min="0" defaultValue={business.lowStockThreshold} className="input" /></label>
        </div>
      </section>

      <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}
