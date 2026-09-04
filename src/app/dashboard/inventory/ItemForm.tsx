"use client";

import { useActionState } from "react";
import { saveItem, type ActionState } from "../actions";
import { ImageField } from "@/components/ImageField";

type ItemValues = {
  id?: string;
  name: string;
  sku: string;
  description: string;
  imageUrl: string;
  pricePerDay: number;
  deposit: number;
  quantity: number;
  minDays: number;
  active: boolean;
  categoryId: string | null;
};

export function ItemForm({ item, categories, uploadsEnabled = true }: { item?: ItemValues; categories: { id: string; name: string }[]; uploadsEnabled?: boolean }) {
  const [state, formAction, pending] = useActionState(saveItem, {} as ActionState);
  return (
    <form action={formAction} encType="multipart/form-data" className="card max-w-2xl space-y-5 p-6">
      {item?.id && <input type="hidden" name="id" value={item.id} />}
      {state.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2"><span className="label">Name</span><input name="name" defaultValue={item?.name} required className="input" placeholder="4-person tent" /></label>
        <label className="block"><span className="label">SKU</span><input name="sku" defaultValue={item?.sku} className="input" placeholder="TENT-4P" /></label>
      </div>
      <label className="block"><span className="label">Description</span><textarea name="description" defaultValue={item?.description} rows={3} className="input" placeholder="What's included, sizing, condition…" /></label>
      <ImageField name="image" label="Photo" current={item?.imageUrl ?? ""} shape="square" placeholderText="No photo yet" uploadsEnabled={uploadsEnabled} />
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="block"><span className="label">Price / day</span><input name="pricePerDay" type="number" step="0.01" min="0" defaultValue={item ? (item.pricePerDay / 100).toFixed(2) : ""} required className="input" /></label>
        <label className="block"><span className="label">Deposit</span><input name="deposit" type="number" step="0.01" min="0" defaultValue={item ? (item.deposit / 100).toFixed(2) : "0"} className="input" /></label>
        <label className="block"><span className="label">Units owned</span><input name="quantity" type="number" min="0" defaultValue={item?.quantity ?? 1} className="input" /></label>
        <label className="block"><span className="label">Min days</span><input name="minDays" type="number" min="1" defaultValue={item?.minDays ?? 1} className="input" /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Category</span>
          <select name="categoryId" defaultValue={item?.categoryId ?? ""} className="input">
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> Listed on storefront
        </label>
      </div>
      <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : item ? "Save changes" : "Add item"}</button>
    </form>
  );
}
