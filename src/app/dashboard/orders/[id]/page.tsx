import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STATUS_LABEL, formatDate, formatDateTime, formatMoney, nextStatuses } from "@/lib/format";
import { paidAmount } from "@/lib/orders";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { recordPayment, refundPayment, updateOrderNotes, updateOrderStatus } from "../../actions";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { business } = await requireBusiness();
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, businessId: business.id },
    include: {
      customer: true,
      items: { include: { item: true } },
      payments: { orderBy: { createdAt: "desc" } },
      reminders: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();
  const paid = paidAmount(order.payments);
  const balance = order.total - paid;
  const transitions = nextStatuses(order.status);

  return (
    <div>
      <PageHeader
        title={`Order #${order.orderNumber}`}
        subtitle={`Placed ${formatDateTime(order.createdAt)} via ${order.source}`}
        action={
          <div className="flex items-center gap-2">
            <Badge status={order.status} />
            {transitions.map((s) => (
              <form key={s} action={updateOrderStatus.bind(null, order.id, s)}>
                <SubmitButton className={s === "CANCELLED" ? "btn-danger" : "btn-primary"} pendingText="Updating…">
                  {s === "CONFIRMED" ? "Confirm" : s === "ACTIVE" ? "Mark picked up" : s === "RETURNED" ? "Mark returned" : "Cancel order"}
                </SubmitButton>
              </form>
            ))}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Items">
            <table className="table">
              <thead><tr><th>Item</th><th>Qty</th><th>Days</th><th>Rate</th><th className="text-right">Line</th></tr></thead>
              <tbody>
                {order.items.map((l) => (
                  <tr key={l.id}>
                    <td><Link href={`/dashboard/inventory/${l.itemId}`} className="hover:underline">{l.item.name}</Link></td>
                    <td>{l.quantity}</td>
                    <td>{l.days}</td>
                    <td>{formatMoney(l.unitPrice, business.currency)}/day</td>
                    <td className="text-right">{formatMoney(l.lineTotal, business.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 ml-auto w-64 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatMoney(order.subtotal, business.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd>{formatMoney(order.tax, business.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Deposit</dt><dd>{formatMoney(order.deposit, business.currency)}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><dt>Total</dt><dd>{formatMoney(order.total, business.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="text-emerald-700">{formatMoney(paid, business.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Balance</dt><dd className={balance > 0 ? "text-amber-700" : ""}>{formatMoney(balance, business.currency)}</dd></div>
            </dl>
          </Card>

          <Card title="Payments">
            {order.payments.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500">No payments recorded.</p>
            ) : (
              <table className="table mb-4">
                <thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {order.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDateTime(p.paidAt ?? p.createdAt)}</td>
                      <td>{p.method}{p.note && <div className="text-xs text-slate-500">{p.note}</div>}</td>
                      <td>{formatMoney(p.amount, p.currency)}</td>
                      <td><Badge status={p.status} /></td>
                      <td className="text-right">
                        {p.status === "paid" && (
                          <form action={refundPayment.bind(null, p.id)}>
                            <button className="text-xs text-rose-700 hover:underline">Refund</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {order.status !== "CANCELLED" && (
              <form action={recordPayment.bind(null, order.id)} className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-4">
                <Field label="Amount">
                  <input name="amount" type="number" step="0.01" min="0.01" defaultValue={(Math.max(balance, 0) / 100).toFixed(2)} className="input" required />
                </Field>
                <Field label="Method">
                  <select name="method" className="input" defaultValue="cash">
                    {["cash", "card", "bank", "other"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Note"><input name="note" className="input" placeholder="Optional" /></Field>
                <div className="flex items-end"><SubmitButton pendingText="Recording…">Record payment</SubmitButton></div>
              </form>
            )}
          </Card>

          <Card title="Reminders sent for this order">
            {order.reminders.length === 0 ? (
              <p className="text-sm text-slate-500">None yet. The AI agent creates reminders as pickup, return or payment dates approach.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {order.reminders.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium">{r.subject}</p>
                      <p className="text-xs text-slate-500">{r.type} · {r.sentAt ? `sent ${formatDateTime(r.sentAt)}` : `created ${formatDateTime(r.createdAt)}`}</p>
                    </div>
                    <Badge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Schedule">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-slate-500 uppercase">Pickup</dt><dd className="font-medium">{formatDate(order.startDate)}</dd></div>
              <div><dt className="text-xs text-slate-500 uppercase">Return</dt><dd className="font-medium">{formatDate(order.endDate)}</dd></div>
              <div><dt className="text-xs text-slate-500 uppercase">Status</dt><dd>{STATUS_LABEL[order.status]}</dd></div>
            </dl>
          </Card>
          <Card title="Customer">
            <p className="font-medium">{order.customer.name}</p>
            <p className="text-sm text-slate-600">{order.customer.email}</p>
            {order.customer.phone && <p className="text-sm text-slate-600">{order.customer.phone}</p>}
            <Link href={`/dashboard/customers?q=${encodeURIComponent(order.customer.email)}`} className="mt-2 block text-xs text-teal-700 hover:underline">View history</Link>
          </Card>
          <Card title="Internal notes">
            <form action={updateOrderNotes.bind(null, order.id)} className="space-y-2">
              <textarea name="notes" defaultValue={order.notes} rows={4} className="input" placeholder="Delivery instructions, damage notes…" />
              <SubmitButton className="btn-secondary">Save notes</SubmitButton>
            </form>
          </Card>
          <Link href={`/s/${business.slug}/orders/${order.id}`} target="_blank" className="block text-sm text-teal-700 hover:underline">
            Customer-facing order page ↗
          </Link>
        </div>
      </div>
    </div>
  );
}
