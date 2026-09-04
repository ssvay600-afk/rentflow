import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { answerCustomer } from "@/lib/bot";

export const maxDuration = 60;

const Body = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().nullable().optional(),
  visitorId: z.string().min(1).max(64),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!business.botEnabled || business.suspended) return NextResponse.json({ error: "Chat is disabled" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const { message, visitorId } = parsed.data;

  let conversation = parsed.data.conversationId
    ? await prisma.conversation.findFirst({ where: { id: parsed.data.conversationId, businessId: business.id } })
    : null;
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { businessId: business.id, visitorId } });
  }

  const reply = await answerCustomer(business, conversation.id, message);

  await prisma.$transaction([
    prisma.message.create({ data: { conversationId: conversation.id, role: "user", content: message } }),
    prisma.message.create({ data: { conversationId: conversation.id, role: "assistant", content: reply.text } }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), ...(reply.escalated ? { escalated: true } : {}) },
    }),
  ]);

  return NextResponse.json({ conversationId: conversation.id, reply: reply.text, escalated: reply.escalated });
}
