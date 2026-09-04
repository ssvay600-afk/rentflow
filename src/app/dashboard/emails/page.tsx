import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { emailProvider } from "@/lib/email";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui";
import { TestEmailButton } from "./TestEmailButton";

export const metadata = { title: "Emails" };

const KIND_LABEL: Record<string, string> = {
  order_confirmation: "Order confirmation",
  payment_receipt: "Payment receipt",
  refund: "Refund notice",
  order_status: "Status update",
  reminder: "Reminder",
  owner_new_order: "New booking (to you)",
  test: "Test",
};

export default async function EmailsPage() {
  const { business } = await requireBusiness();
  const emails = await prisma.emailLog.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const provider = emailProvider();

  return (
    <div>
      <PageHeader
        title="Emails"
        subtitle="Every confirmation, receipt, refund notice, status update and reminder sent to your customers, plus new-booking alerts sent to you."
        action={<TestEmailButton />}
      />
      {!provider && (
        <div className="mb-6">
          <Alert tone="warn">
            No email provider is configured on this RentFlow install, so messages are stored here but not delivered. The platform owner needs to set{" "}
            <span className="font-mono">RESEND_API_KEY</span> (recommended) or SMTP settings.
          </Alert>
        </div>
      )}
      {emails.length === 0 ? (
        <EmptyState title="No emails yet" body="Emails are sent automatically when customers book, pay, get refunded, or when order status changes." />
      ) : (
        <div className="space-y-2">
          {emails.map((e) => (
            <details key={e.id} className="card">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.subject}</p>
                  <p className="text-xs text-slate-500">{KIND_LABEL[e.kind] ?? e.kind} · to {e.to} · {formatDateTime(e.createdAt)}</p>
                </div>
                <Badge status={e.status === "sent" ? "sent" : e.status === "failed" ? "failed" : "pending"}>{e.status === "logged" ? "Not delivered" : e.status}</Badge>
              </summary>
              <div className="border-t border-slate-100 px-5 py-4">
                {e.error && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{e.error}</p>}
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{e.text}</pre>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
