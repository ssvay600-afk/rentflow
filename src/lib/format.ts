export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateRange(start: Date | string, end: Date | string) {
  return `${formatDate(start)} → ${formatDate(end)}`;
}

/** yyyy-mm-dd for <input type="date"> */
export function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a yyyy-mm-dd string as local midnight. */
export function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive rental length in days: same-day pickup and return counts as 1 day. */
export function rentalDays(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function daysFromNow(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export type AddressLike = { fulfillment: string; addressLine1: string; addressLine2: string; city: string; region: string; postalCode: string };

/** One-line service address, or "Pickup in store" for pickup orders. */
export function formatAddress(o: AddressLike) {
  if (o.fulfillment === "pickup") return "Pickup in store";
  const parts = [o.addressLine1, o.addressLine2, [o.city, o.region].filter(Boolean).join(", "), o.postalCode].filter((s) => s && s.trim());
  return parts.join(", ") || "No address given";
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const ORDER_STATUSES = ["PENDING", "CONFIRMED", "ACTIVE", "RETURNED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  ACTIVE: "Out on rental",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

export const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-sky-100 text-sky-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  RETURNED: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-rose-100 text-rose-800",
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  refunded: "bg-slate-100 text-slate-700",
  failed: "bg-rose-100 text-rose-800",
  draft: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  sent: "bg-emerald-100 text-emerald-800",
  skipped: "bg-slate-100 text-slate-700",
};

/** Which statuses an order may move to from its current one. */
export function nextStatuses(status: string): OrderStatus[] {
  switch (status) {
    case "PENDING":
      return ["CONFIRMED", "CANCELLED"];
    case "CONFIRMED":
      return ["ACTIVE", "CANCELLED"];
    case "ACTIVE":
      return ["RETURNED"];
    default:
      return [];
  }
}
