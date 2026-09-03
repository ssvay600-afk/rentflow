import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { formatDateTime } from "@/lib/format";
import { Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { saveBotSettings } from "../actions";

export const metadata = { title: "Support bot" };

export default async function BotPage() {
  const { business } = await requireBusiness();
  const conversations = await prisma.conversation.findMany({
    where: { businessId: business.id },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, customer: true, _count: { select: { messages: true } } },
    orderBy: [{ escalated: "desc" }, { updatedAt: "desc" }],
    take: 50,
  });

  return (
    <div>
      <PageHeader
        title="AI customer service bot"
        subtitle="Lives on your storefront. Quotes prices, checks availability, looks up orders and books reservations, and escalates to you when needed."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Conversations</h2>
          {conversations.length === 0 ? (
            <EmptyState title="No conversations yet" body="Chats from the storefront widget appear here." />
          ) : (
            <div className="card divide-y divide-slate-100">
              {conversations.map((c) => (
                <Link key={c.id} href={`/dashboard/bot/${c.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {c.customer?.name ?? `Visitor ${c.visitorId.slice(0, 6)}`}
                      {c.escalated && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Needs you</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{c.messages[0]?.content ?? "—"}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-400">
                    <p>{formatDateTime(c.updatedAt)}</p>
                    <p>{c._count.messages} msgs</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Bot settings">
            <form action={saveBotSettings} className="space-y-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="botEnabled" defaultChecked={business.botEnabled} /> Show chat widget on storefront</label>
              <Field label="Bot name"><input name="botName" defaultValue={business.botName} className="input" /></Field>
              <Field label="Greeting"><textarea name="botGreeting" defaultValue={business.botGreeting} rows={2} className="input" /></Field>
              <Field label="Knowledge base" hint="Policies, hours, FAQs, delivery areas. The bot and reminder agent both use this.">
                <textarea name="policies" defaultValue={business.policies} rows={10} className="input font-mono text-xs" />
              </Field>
              <SubmitButton>Save</SubmitButton>
            </form>
          </Card>
          <Card title="Status">
            <p className={`text-sm ${aiEnabled() ? "text-emerald-700" : "text-amber-700"}`}>
              {aiEnabled() ? "● Powered by Claude with live tools" : "● Demo mode: rule-based answers (add ANTHROPIC_API_KEY)"}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
