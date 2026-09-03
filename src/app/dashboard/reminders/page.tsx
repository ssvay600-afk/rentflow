import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { runAgentNow, saveReminderSettings, sendReminderNow, skipReminder, updateReminderText } from "../actions";

export const metadata = { title: "AI Reminders" };

const TYPE_LABEL: Record<string, string> = {
  pickup: "Pickup",
  return: "Return",
  overdue: "Overdue",
  payment_due: "Payment due",
  custom: "Custom",
};

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { business } = await requireBusiness();
  const { view } = await searchParams;
  const showAll = view === "all";
  const [reminders, runs] = await Promise.all([
    prisma.reminder.findMany({
      where: { businessId: business.id, ...(showAll ? {} : { status: { in: ["draft", "approved", "failed"] } }) },
      include: { customer: true, order: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.agentRun.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const smtp = Boolean(process.env.SMTP_HOST);

  return (
    <div>
      <PageHeader
        title="AI reminder agent"
        subtitle="Drafts pickup, return, overdue and payment reminders for every open order, then sends them once you approve (or automatically)."
        action={
          <form action={runAgentNow}>
            <SubmitButton pendingText="Agent running…">Run agent now</SubmitButton>
          </form>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard/reminders" className={!showAll ? "font-medium text-teal-800" : "text-slate-500"}>Needs attention</Link>
            <Link href="/dashboard/reminders?view=all" className={showAll ? "font-medium text-teal-800" : "text-slate-500"}>All reminders</Link>
          </div>
          {reminders.length === 0 ? (
            <EmptyState title={showAll ? "No reminders yet" : "Inbox zero"} body="Run the agent to scan your open orders for anything due." />
          ) : (
            reminders.map((r) => (
              <details key={r.id} className="card" open={r.status === "draft" || r.status === "failed"}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-medium">{r.subject}</p>
                    <p className="text-xs text-slate-500">
                      {TYPE_LABEL[r.type] ?? r.type} · {r.customer.name} ({r.customer.email})
                      {r.order && <> · <Link href={`/dashboard/orders/${r.order.id}`} className="text-teal-700 hover:underline">#{r.order.orderNumber}</Link></>}
                      {" · "}{r.aiGenerated ? "written by Claude" : "template"}
                    </p>
                  </div>
                  <Badge status={r.status} />
                </summary>
                <div className="border-t border-slate-100 px-5 py-4">
                  {r.status === "sent" ? (
                    <>
                      <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{r.body}</pre>
                      <p className="mt-2 text-xs text-slate-500">Sent {r.sentAt && formatDateTime(r.sentAt)} · {r.deliveryNote}</p>
                    </>
                  ) : (
                    <>
                      <form action={updateReminderText.bind(null, r.id)} className="space-y-2">
                        <input name="subject" defaultValue={r.subject} className="input" />
                        <textarea name="body" defaultValue={r.body} rows={7} className="input font-mono text-xs" />
                        <div className="flex flex-wrap gap-2">
                          <SubmitButton className="btn-secondary" pendingText="Saving…">Save edits</SubmitButton>
                        </div>
                      </form>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <form action={sendReminderNow.bind(null, r.id)}>
                          <SubmitButton pendingText="Sending…">Approve & send</SubmitButton>
                        </form>
                        <form action={skipReminder.bind(null, r.id)}>
                          <SubmitButton className="btn-secondary" pendingText="…">Skip</SubmitButton>
                        </form>
                        {r.status === "failed" && <span className="text-xs text-rose-700">{r.deliveryNote}</span>}
                      </div>
                    </>
                  )}
                </div>
              </details>
            ))
          )}
        </div>

        <div className="space-y-6">
          <Card title="Agent settings">
            <form action={saveReminderSettings} className="space-y-3 text-sm">
              <Field label="Remind this many days before" hint="Applies to pickups and returns.">
                <input name="remindBeforeDays" type="number" min={0} max={14} defaultValue={business.remindBeforeDays} className="input" />
              </Field>
              <label className="flex items-center gap-2"><input type="checkbox" name="remindOverdue" defaultChecked={business.remindOverdue} /> Chase overdue returns</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="remindPaymentDue" defaultChecked={business.remindPaymentDue} /> Chase unpaid balances</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="autoSendReminders" defaultChecked={business.autoSendReminders} /> Auto-send without approval</label>
              <SubmitButton className="btn-secondary">Save settings</SubmitButton>
            </form>
          </Card>
          <Card title="Status">
            <ul className="space-y-1 text-sm">
              <li className={aiEnabled() ? "text-emerald-700" : "text-amber-700"}>{aiEnabled() ? "● Claude writes personalised messages" : "● Template mode (no ANTHROPIC_API_KEY)"}</li>
              <li className={smtp ? "text-emerald-700" : "text-amber-700"}>{smtp ? "● Email delivery via SMTP" : "● Outbox only (no SMTP configured)"}</li>
              <li className="text-slate-600">● Scheduler: every {process.env.REMINDER_AGENT_INTERVAL_MINUTES ?? "30"} min in dev, or call <span className="font-mono text-xs">/api/cron/reminders</span></li>
            </ul>
          </Card>
          <Card title="Recent runs">
            {runs.length === 0 ? (
              <p className="text-sm text-slate-500">No runs yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {runs.map((run) => (
                  <li key={run.id}>
                    <p className="text-slate-700">{run.summary}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(run.createdAt)} · {run.trigger}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
