import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { resolveConversation } from "../../actions";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { business } = await requireBusiness();
  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, businessId: business.id },
    include: { messages: { orderBy: { createdAt: "asc" } }, customer: true },
  });
  if (!conversation) notFound();

  return (
    <div>
      <PageHeader
        title={conversation.customer?.name ?? `Visitor ${conversation.visitorId.slice(0, 6)}`}
        subtitle={`Started ${formatDateTime(conversation.createdAt)}`}
        action={
          conversation.escalated ? (
            <form action={resolveConversation.bind(null, conversation.id)}>
              <SubmitButton pendingText="…">Mark resolved</SubmitButton>
            </form>
          ) : (
            <Link href="/dashboard/bot" className="btn-secondary">Back to inbox</Link>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <ol className="space-y-3">
            {conversation.messages.map((m) => (
              <li key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-slate-100 text-slate-800" : "bg-teal-700 text-white"}`}>
                  {m.content}
                  <p className={`mt-1 text-[10px] ${m.role === "user" ? "text-slate-400" : "text-teal-100"}`}>{formatDateTime(m.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Customer">
          {conversation.customer ? (
            <>
              <p className="font-medium">{conversation.customer.name}</p>
              <p className="text-sm text-slate-600">{conversation.customer.email}</p>
              {conversation.customer.phone && <p className="text-sm text-slate-600">{conversation.customer.phone}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-500">Anonymous visitor. If they booked through the bot, the customer is linked here.</p>
          )}
          {conversation.escalated && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The bot asked for a human. Follow up by email or phone, then mark resolved.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
