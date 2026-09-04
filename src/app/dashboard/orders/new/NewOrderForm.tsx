"use client";

import { useActionState, useMemo, useState } from "react";
import { createManualOrder, type ActionState } from "../../actions";
import { formatMoney, parseDateInput, rentalDays, toDateInput } from "@/lib/format";

type ItemOption = { id: string; name: string; pricePerDay: number; deposit: number; quantity: number; minDays: number };

export function NewOrderForm({ items, currency, taxRate }: { items: ItemOption[]; currency: string; taxRate: number }) {
  const [state, formAction, pending] = useActionState(createManualOrder, {} as ActionState);
  const today = new Date();
  const [start, setStart] = useState(toDateInput(today));
  const [end, setEnd] = useState(toDateInput(today));
  const [qty, setQty] = useState<Record<string, number>>({});

  const quote = useMemo(() => {
    const s = parseDateInput(start);
    const e = parseDateInput(end);
    const days = s && e && e >= s ? rentalDays(s, e) : 1;
    let subtotal = 0;
    let deposit = 0;
    for (const it of items) {
      const q = qty[it.id] ?? 0;
      if (q > 0) {
        subtotal += it.pricePerDay * Math.max(days, it.minDays) * q;
        deposit += it.deposit * q;
      }
    }
    const tax = Math.round((subtotal * taxRate) / 100);
    return { days, subtotal, deposit, tax, total: subtotal + tax + deposit };
  }, [items, qty, start, end, taxRate]);

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {state.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Dates</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="label">Pickup</span><input type="date" name="startDate" value={start} onChange={(e) => setStart(e.target.value)} className="input" required /></label>
            <label className="block"><span className="label">Return</span><input type="date" name="endDate" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="input" required /></label>
          </div>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Items</h2>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">Add inventory first.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Item</th><th>Rate</th><th>Units</th><th className="w-28">Qty</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.name}</td>
                    <td className="text-slate-600">{formatMoney(it.pricePerDay, currency)}/day</td>
                    <td className="text-slate-600">{it.quantity} total</td>
                    <td>
                      <input
                        type="number"
                        name={`qty_${it.id}`}
                        min={0}
                        max={it.quantity}
                        value={qty[it.id] ?? 0}
                        onChange={(e) => setQty({ ...qty, [it.id]: Math.max(0, Number(e.target.value) || 0) })}
                        className="input"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Customer</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block"><span className="label">Name</span><input name="customerName" className="input" required /></label>
            <label className="block"><span className="label">Email</span><input name="customerEmail" type="email" className="input" required /></label>
            <label className="block"><span className="label">Phone</span><input name="customerPhone" className="input" /></label>
          </div>
          <div className="mt-4">
            <span className="label">Fulfillment</span>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="fulfillment" value="delivery" defaultChecked /> Deliver / serve at address</label>
              <label className="flex items-center gap-2"><input type="radio" name="fulfillment" value="pickup" /> Customer picks up</label>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="label">Street address</span><input name="addressLine1" className="input" /></label>
            <label className="block sm:col-span-2"><span className="label">Apt, suite, venue</span><input name="addressLine2" className="input" /></label>
            <label className="block"><span className="label">City</span><input name="city" className="input" /></label>
            <label className="block"><span className="label">State / region</span><input name="region" className="input" /></label>
            <label className="block"><span className="label">Postal code</span><input name="postalCode" className="input" /></label>
          </div>
          <label className="mt-4 block"><span className="label">Notes</span><textarea name="notes" rows={2} className="input" /></label>
        </section>
      </div>
      <aside className="card h-fit p-5">
        <h2 className="text-sm font-semibold text-slate-700">Quote</h2>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Days</dt><dd>{quote.days}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatMoney(quote.subtotal, currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Tax ({taxRate}%)</dt><dd>{formatMoney(quote.tax, currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Deposit</dt><dd>{formatMoney(quote.deposit, currency)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Total</dt><dd>{formatMoney(quote.total, currency)}</dd></div>
        </dl>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" defaultChecked /> Mark as confirmed
        </label>
        <button type="submit" disabled={pending} className="btn-primary mt-4 w-full">
          {pending ? "Creating…" : "Create order"}
        </button>
      </aside>
    </form>
  );
}
