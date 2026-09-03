"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, parseDateInput, rentalDays, toDateInput } from "@/lib/format";

export type StoreItem = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  pricePerDay: number;
  deposit: number;
  quantity: number;
  minDays: number;
  category: string;
};

type Cart = { start: string; end: string; lines: Record<string, number> };

export function Storefront({ slug, currency, taxRate, items }: { slug: string; currency: string; taxRate: number; items: StoreItem[] }) {
  const router = useRouter();
  const storageKey = `rf-cart-${slug}`;
  const today = toDateInput(new Date());
  const [cart, setCart] = useState<Cart>({ start: today, end: today, lines: {} });
  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [checking, setChecking] = useState(false);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Cart;
        if (parsed.start >= today) setCart(parsed);
      }
    } catch {}
  }, [storageKey, today]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {}
  }, [cart, storageKey]);

  // Live availability for the chosen dates.
  useEffect(() => {
    const s = parseDateInput(cart.start);
    const e = parseDateInput(cart.end);
    if (!s || !e || e < s) return;
    const ctrl = new AbortController();
    setChecking(true);
    fetch(`/api/storefront/${slug}/availability?start=${cart.start}&end=${cart.end}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: { items: Record<string, number> }) => setAvailability(data.items))
      .catch(() => {})
      .finally(() => setChecking(false));
    return () => ctrl.abort();
  }, [cart.start, cart.end, slug]);

  const days = useMemo(() => {
    const s = parseDateInput(cart.start);
    const e = parseDateInput(cart.end);
    return s && e && e >= s ? rentalDays(s, e) : 1;
  }, [cart.start, cart.end]);

  const quote = useMemo(() => {
    let subtotal = 0;
    let deposit = 0;
    const lines: { item: StoreItem; qty: number; total: number }[] = [];
    for (const item of items) {
      const qty = cart.lines[item.id] ?? 0;
      if (qty > 0) {
        const total = item.pricePerDay * Math.max(days, item.minDays) * qty;
        subtotal += total;
        deposit += item.deposit * qty;
        lines.push({ item, qty, total });
      }
    }
    const tax = Math.round((subtotal * taxRate) / 100);
    return { lines, subtotal, deposit, tax, total: subtotal + tax + deposit };
  }, [cart.lines, days, items, taxRate]);

  function setQty(itemId: string, qty: number) {
    setCart((c) => ({ ...c, lines: { ...c.lines, [itemId]: Math.max(0, qty) } }));
  }

  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/storefront/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: cart.start,
          end: cart.end,
          lines: Object.entries(cart.lines)
            .filter(([, q]) => q > 0)
            .map(([itemId, quantity]) => ({ itemId, quantity })),
          customer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      localStorage.removeItem(storageKey);
      if (data.payUrl.startsWith("http")) window.location.href = data.payUrl;
      else router.push(data.payUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setSubmitting(false);
    }
  }

  const categories = Array.from(new Set(items.map((i) => i.category)));

  return (
    <section id="book" className="mx-auto max-w-6xl px-6 py-12">
      <div className="card mb-8 flex flex-wrap items-end gap-4 p-5">
        <label className="block">
          <span className="label">Pickup date</span>
          <input type="date" min={today} value={cart.start} onChange={(e) => setCart((c) => ({ ...c, start: e.target.value, end: c.end < e.target.value ? e.target.value : c.end }))} className="input w-44" />
        </label>
        <label className="block">
          <span className="label">Return date</span>
          <input type="date" min={cart.start} value={cart.end} onChange={(e) => setCart((c) => ({ ...c, end: e.target.value }))} className="input w-44" />
        </label>
        <p className="pb-2 text-sm text-slate-600">
          {days} day{days === 1 ? "" : "s"} {checking && <span className="text-slate-400">· checking availability…</span>}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          {items.length === 0 && <p className="text-slate-500">Nothing listed yet. Check back soon.</p>}
          {categories.map((cat) => (
            <div key={cat}>
              <h2 className="mb-4 text-xl font-semibold tracking-tight">{cat}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {items
                  .filter((i) => i.category === cat)
                  .map((item) => {
                    const free = availability[item.id] ?? item.quantity;
                    const qty = cart.lines[item.id] ?? 0;
                    return (
                      <article key={item.id} className="card flex flex-col overflow-hidden">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt={item.name} className="h-44 w-full object-cover" />
                        ) : (
                          <div className="flex h-44 items-center justify-center bg-slate-100 text-slate-400">No image</div>
                        )}
                        <div className="flex flex-1 flex-col p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold">{item.name}</h3>
                            <span className="whitespace-nowrap text-sm font-medium">{formatMoney(item.pricePerDay, currency)}/day</span>
                          </div>
                          <p className="mt-1 line-clamp-3 text-sm text-slate-600">{item.description}</p>
                          <div className="mt-auto flex items-center justify-between pt-4">
                            <span className={`text-xs ${free === 0 ? "text-rose-600" : "text-slate-500"}`}>
                              {free === 0 ? "Sold out for these dates" : `${free} available`}
                              {item.deposit > 0 && ` · ${formatMoney(item.deposit, currency)} deposit`}
                            </span>
                            {qty === 0 ? (
                              <button type="button" disabled={free === 0} className="btn-brand" onClick={() => setQty(item.id, 1)}>
                                Add
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button type="button" className="btn-secondary px-2 py-1" onClick={() => setQty(item.id, qty - 1)}>−</button>
                                <span className="w-6 text-center text-sm font-medium">{qty}</span>
                                <button type="button" disabled={qty >= free} className="btn-secondary px-2 py-1" onClick={() => setQty(item.id, qty + 1)}>+</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <aside className="card sticky top-6 h-fit p-5">
          <h2 className="text-lg font-semibold">Your booking</h2>
          {quote.lines.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Pick dates and add items to get an instant quote.</p>
          ) : (
            <form onSubmit={checkout} className="mt-3 space-y-4">
              <ul className="divide-y divide-slate-100 text-sm">
                {quote.lines.map(({ item, qty, total }) => (
                  <li key={item.id} className="flex justify-between py-2">
                    <span>{qty}× {item.name}</span>
                    <span>{formatMoney(total, currency)}</span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Rental ({days} days)</dt><dd>{formatMoney(quote.subtotal, currency)}</dd></div>
                {quote.tax > 0 && <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd>{formatMoney(quote.tax, currency)}</dd></div>}
                {quote.deposit > 0 && <div className="flex justify-between"><dt className="text-slate-500">Refundable deposit</dt><dd>{formatMoney(quote.deposit, currency)}</dd></div>}
                <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold"><dt>Total due</dt><dd>{formatMoney(quote.total, currency)}</dd></div>
              </dl>
              <div className="space-y-2">
                <input required placeholder="Full name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className="input" />
                <input required type="email" placeholder="Email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} className="input" />
                <input placeholder="Phone (optional)" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="input" />
                <textarea placeholder="Notes (optional)" rows={2} value={customer.notes} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} className="input" />
              </div>
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              <button type="submit" disabled={submitting} className="btn-brand w-full py-3">
                {submitting ? "Reserving…" : "Book & pay"}
              </button>
              <p className="text-center text-xs text-slate-400">Your items are held once payment completes.</p>
            </form>
          )}
        </aside>
      </div>
    </section>
  );
}
