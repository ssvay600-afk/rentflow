import type { Business, Customer, Order, OrderItem, Item, Payment } from "@prisma/client";
import { prisma } from "./db";
import { sendEmail } from "./email";
import { STATUS_LABEL, formatAddress, formatDate, formatMoney } from "./format";
import { paidAmount } from "./orders";
import { appUrl } from "./stripe";

type FullOrder = Order & { business: Business; customer: Customer; items: (OrderItem & { item: Item })[]; payments: Payment[] };

async function loadOrder(orderId: string): Promise<FullOrder | null> {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { business: true, customer: true, items: { include: { item: true } }, payments: true },
  });
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

function orderUrl(o: FullOrder) {
  const base = o.business.customDomain && o.business.customDomainVerified ? `https://${o.business.customDomain}` : `${appUrl()}/s/${o.business.slug}`;
  return `${base}/orders/${o.id}`;
}

/** Shared HTML shell in the business's brand colour. */
function layout(b: Business, title: string, bodyHtml: string) {
  const contact = [b.email, b.phone, b.address].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html><html><body style="margin:0;background:#f5f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:${esc(b.primaryColor)};padding:20px 24px;color:#fff;font-size:20px;font-weight:600">${esc(b.name)}</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${esc(b.name)}${contact ? ` · ${contact}` : ""}<br>Powered by RentFlow</td></tr>
</table></td></tr></table></body></html>`;
}

function receiptTable(o: FullOrder) {
  const c = o.business.currency;
  const rows = o.items
    .map((l) => `<tr><td style="padding:6px 0">${l.quantity}× ${esc(l.item.name)} <span style="color:#64748b">· ${l.days} day${l.days === 1 ? "" : "s"} @ ${formatMoney(l.unitPrice, c)}</span></td><td align="right" style="padding:6px 0">${formatMoney(l.lineTotal, c)}</td></tr>`)
    .join("");
  const paid = paidAmount(o.payments);
  const balance = o.total - paid;
  const line = (label: string, v: string, bold = false) =>
    `<tr><td style="padding:4px 0;color:#64748b">${label}</td><td align="right" style="padding:4px 0;${bold ? "font-weight:600;color:#0f172a" : ""}">${v}</td></tr>`;
  return `<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">${rows}
<tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:8px"></td></tr>
${line("Subtotal", formatMoney(o.subtotal, c))}${o.tax ? line("Tax", formatMoney(o.tax, c)) : ""}${o.deposit ? line("Refundable deposit", formatMoney(o.deposit, c)) : ""}
${line("Total", formatMoney(o.total, c), true)}${line("Paid", formatMoney(paid, c))}${balance > 0 ? line("Balance due", formatMoney(balance, c), true) : ""}</table>`;
}

function receiptText(o: FullOrder) {
  const c = o.business.currency;
  const paid = paidAmount(o.payments);
  const lines = o.items.map((l) => `  ${l.quantity}× ${l.item.name} · ${l.days} day(s) @ ${formatMoney(l.unitPrice, c)} = ${formatMoney(l.lineTotal, c)}`);
  return [
    `Order #${o.orderNumber}`,
    `Pickup: ${formatDate(o.startDate)} · Return: ${formatDate(o.endDate)}`,
    `${o.fulfillment === "pickup" ? "Pickup" : "Service address"}: ${formatAddress(o)}`,
    "",
    ...lines,
    "",
    `Subtotal: ${formatMoney(o.subtotal, c)}`,
    o.tax ? `Tax: ${formatMoney(o.tax, c)}` : "",
    o.deposit ? `Deposit: ${formatMoney(o.deposit, c)}` : "",
    `Total: ${formatMoney(o.total, c)}`,
    `Paid: ${formatMoney(paid, c)}`,
    o.total - paid > 0 ? `Balance due: ${formatMoney(o.total - paid, c)}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function detailsHtml(o: FullOrder) {
  return `<p style="margin:0 0 16px;font-size:14px;color:#334155">
<strong>Order #${o.orderNumber}</strong><br>
Pickup: ${formatDate(o.startDate)} · Return: ${formatDate(o.endDate)}<br>
${o.fulfillment === "pickup" ? "Pickup" : "Service address"}: ${esc(formatAddress(o))}${o.notes ? `<br>Notes: ${esc(o.notes)}` : ""}</p>`;
}

function button(url: string, label: string, color: string) {
  return `<p style="margin:20px 0"><a href="${esc(url)}" style="display:inline-block;background:${esc(color)};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${esc(label)}</a></p>`;
}

async function deliver(o: FullOrder, kind: "order_confirmation" | "payment_receipt" | "refund" | "order_status", subject: string, title: string, intro: string, extraHtml = "", extraText = "") {
  const b = o.business;
  const url = orderUrl(o);
  const html = layout(b, title, `<p style="margin:0 0 16px;font-size:15px">${esc(intro)}</p>${detailsHtml(o)}${receiptTable(o)}${extraHtml}${button(url, "View your order", b.primaryColor)}`);
  const text = `${intro}\n\n${receiptText(o)}\n${extraText ? `\n${extraText}\n` : ""}\nView your order: ${url}\n\n— ${b.name}${b.phone ? ` · ${b.phone}` : ""}`;
  return sendEmail({ businessId: b.id, kind, to: o.customer.email, subject, text, html, replyTo: b.email || undefined, fromName: b.name });
}

// ---------------------------------------------------------------------------
// Public API – each is safe to call from request handlers; failures are logged, never thrown.
// ---------------------------------------------------------------------------

export async function sendOrderConfirmation(orderId: string, opts: { payUrl?: string | null } = {}) {
  const o = await loadOrder(orderId);
  if (!o) return;
  const first = o.customer.name.split(" ")[0];
  const balance = o.total - paidAmount(o.payments);
  const payHtml = opts.payUrl && balance > 0 ? button(opts.payUrl, `Pay ${formatMoney(balance, o.business.currency)} now`, "#0f172a") : "";
  const payText = opts.payUrl && balance > 0 ? `Pay now: ${opts.payUrl}` : "";
  const pending = o.status === "PENDING";
  await deliver(
    o,
    "order_confirmation",
    `${pending ? "We received your booking" : "Booking confirmed"} – ${o.business.name} order #${o.orderNumber}`,
    pending ? "We've received your booking request" : "Your booking is confirmed",
    `Hi ${first}, thanks for booking with ${o.business.name}. ${pending ? (balance > 0 ? "Complete payment to confirm your reservation." : "We'll confirm it shortly.") : "Here is your receipt."}`,
    payHtml,
    payText,
  ).catch((e) => console.error("order confirmation failed", e));
}

export async function sendPaymentReceipt(paymentId: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.status !== "paid") return;
  const o = await loadOrder(p.orderId);
  if (!o) return;
  const first = o.customer.name.split(" ")[0];
  await deliver(
    o,
    "payment_receipt",
    `Payment receipt – ${formatMoney(p.amount, p.currency)} for order #${o.orderNumber}`,
    "Payment received",
    `Hi ${first}, we've received your payment of ${formatMoney(p.amount, p.currency)} (${p.method}) for order #${o.orderNumber}.${o.status === "CONFIRMED" ? " Your booking is confirmed." : ""}`,
  ).catch((e) => console.error("payment receipt failed", e));
}

export async function sendRefundNotice(paymentId: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p) return;
  const o = await loadOrder(p.orderId);
  if (!o) return;
  const first = o.customer.name.split(" ")[0];
  await deliver(
    o,
    "refund",
    `Refund issued – ${formatMoney(p.amount, p.currency)} for order #${o.orderNumber}`,
    "Refund issued",
    `Hi ${first}, we've refunded ${formatMoney(p.amount, p.currency)} for order #${o.orderNumber}.${p.method === "stripe" ? " It usually appears on your statement within 5–10 business days." : ""}`,
  ).catch((e) => console.error("refund notice failed", e));
}

export async function sendOrderStatusEmail(orderId: string) {
  const o = await loadOrder(orderId);
  if (!o) return;
  const first = o.customer.name.split(" ")[0];
  const copy: Record<string, { subject: string; title: string; intro: string }> = {
    CONFIRMED: { subject: `Booking confirmed – order #${o.orderNumber}`, title: "Your booking is confirmed", intro: `Hi ${first}, your booking with ${o.business.name} is confirmed. Here's your receipt.` },
    ACTIVE: {
      subject: `Your rental has started – order #${o.orderNumber}`,
      title: o.fulfillment === "pickup" ? "Picked up – enjoy!" : "Delivered – enjoy!",
      intro: `Hi ${first}, order #${o.orderNumber} is now out on rental. Return is due ${formatDate(o.endDate)}.`,
    },
    RETURNED: { subject: `Thanks for renting with ${o.business.name}`, title: "Rental complete", intro: `Hi ${first}, we've checked in order #${o.orderNumber}. Thank you!${o.deposit ? " Your deposit will be released per our policy." : ""}` },
    CANCELLED: { subject: `Booking cancelled – order #${o.orderNumber}`, title: "Booking cancelled", intro: `Hi ${first}, order #${o.orderNumber} has been cancelled. If you paid, any refund will follow our cancellation policy.` },
  };
  const c = copy[o.status];
  if (!c) return;
  await deliver(o, "order_status", c.subject, c.title, c.intro).catch((e) => console.error("status email failed", e));
}

/** Tells the business owner about a new booking. */
export async function notifyOwnerNewOrder(orderId: string) {
  const o = await loadOrder(orderId);
  if (!o) return;
  const owner = await prisma.user.findUnique({ where: { id: o.business.ownerId } });
  const to = o.business.email || owner?.email;
  if (!to) return;
  const b = o.business;
  const url = `${appUrl()}/dashboard/orders/${o.id}`;
  const summary = o.items.map((l) => `${l.quantity}× ${l.item.name}`).join(", ");
  const text = `New booking #${o.orderNumber} from ${o.customer.name} (${o.customer.email}${o.customer.phone ? `, ${o.customer.phone}` : ""})\n${summary}\n${formatDate(o.startDate)} → ${formatDate(o.endDate)}\n${o.fulfillment === "pickup" ? "Pickup in store" : `Deliver to: ${formatAddress(o)}`}\nTotal ${formatMoney(o.total, b.currency)} · ${STATUS_LABEL[o.status]}\n\nOpen: ${url}`;
  const html = layout(
    b,
    `New booking #${o.orderNumber}`,
    `<p style="font-size:15px;margin:0 0 12px"><strong>${esc(o.customer.name)}</strong> · ${esc(o.customer.email)}${o.customer.phone ? ` · ${esc(o.customer.phone)}` : ""}</p>${detailsHtml(o)}${receiptTable(o)}${button(url, "Open in dashboard", b.primaryColor)}`,
  );
  await sendEmail({ businessId: b.id, kind: "owner_new_order", to, subject: `New booking #${o.orderNumber} – ${o.customer.name}`, text, html }).catch((e) => console.error("owner notify failed", e));
}

/** Used by the "Send test email" button in the dashboard. */
export async function sendTestEmail(business: Business, to: string) {
  const html = layout(business, "Email is working", `<p style="font-size:15px">This is a test message from your RentFlow dashboard. Customers will receive booking confirmations, receipts, refunds, status updates and reminders that look like this.</p>`);
  return sendEmail({ businessId: business.id, kind: "test", to, subject: `Test email from ${business.name}`, text: "This is a test message from your RentFlow dashboard. Email delivery is working.", html, fromName: business.name });
}
