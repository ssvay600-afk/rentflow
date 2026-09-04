import type { Business, Customer, Order, OrderItem, Item } from "@prisma/client";
import { prisma } from "./db";
import { CLAUDE_MODEL, describeAiError, getClaude } from "./ai";
import { formatAddress, formatDate, formatMoney } from "./format";
import { sendEmail } from "./mailer";
import { paidAmount } from "./orders";

export type ReminderType = "pickup" | "return" | "overdue" | "payment_due";

type OrderWithDetails = Order & {
  customer: Customer;
  items: (OrderItem & { item: Item })[];
  payments: { status: string; amount: number }[];
};

const TYPE_LABEL: Record<ReminderType, string> = {
  pickup: "Pickup reminder",
  return: "Return reminder",
  overdue: "Overdue notice",
  payment_due: "Payment reminder",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Decide which reminders an order needs right now. */
function dueReminders(business: Business, order: OrderWithDetails, now: Date): ReminderType[] {
  const today = startOfDay(now);
  const horizon = addDays(today, business.remindBeforeDays);
  const start = startOfDay(order.startDate);
  const end = startOfDay(order.endDate);
  const balance = order.total - paidAmount(order.payments);
  const due: ReminderType[] = [];

  if (order.status === "CONFIRMED" && start >= today && start <= horizon) due.push("pickup");
  if (order.status === "ACTIVE" && end >= today && end <= horizon) due.push("return");
  if (order.status === "ACTIVE" && end < today && business.remindOverdue) due.push("overdue");
  if (
    business.remindPaymentDue &&
    balance > 0 &&
    (order.status === "PENDING" || order.status === "CONFIRMED") &&
    start <= addDays(horizon, 2)
  ) {
    due.push("payment_due");
  }
  return due;
}

function templateMessage(business: Business, order: OrderWithDetails, type: ReminderType) {
  const items = order.items.map((l) => `${l.quantity}× ${l.item.name}`).join(", ");
  const balance = order.total - paidAmount(order.payments);
  const first = order.customer.name.split(" ")[0];
  const sig = `\n\n— ${business.name}${business.phone ? ` · ${business.phone}` : ""}${business.address ? `\n${business.address}` : ""}`;
  switch (type) {
    case "pickup":
      return order.fulfillment === "pickup"
        ? {
            subject: `Your ${business.name} rental starts ${formatDate(order.startDate)}`,
            body: `Hi ${first},\n\nA quick reminder that your rental (order #${order.orderNumber}: ${items}) is ready for pickup on ${formatDate(order.startDate)}.\n\nPlease bring a photo ID. Reply to this email if your plans change.${sig}`,
          }
        : {
            subject: `Your ${business.name} delivery is on ${formatDate(order.startDate)}`,
            body: `Hi ${first},\n\nA quick reminder that we'll deliver your order #${order.orderNumber} (${items}) on ${formatDate(order.startDate)} to ${formatAddress(order)}.\n\nPlease make sure someone is there to receive it. Reply to this email if anything has changed.${sig}`,
          };
    case "return":
      return {
        subject: `Reminder: return your rental by ${formatDate(order.endDate)}`,
        body: `Hi ${first},\n\nYour rental (order #${order.orderNumber}: ${items}) is due back on ${formatDate(order.endDate)}. Need more time? Reply and we'll check if an extension is available.${sig}`,
      };
    case "overdue":
      return {
        subject: `Order #${order.orderNumber} is overdue`,
        body: `Hi ${first},\n\nOur records show your rental (${items}) was due back on ${formatDate(order.endDate)} and hasn't been returned yet. Please return it as soon as possible or contact us to arrange an extension. Late fees may apply per our rental terms.${sig}`,
      };
    case "payment_due":
      return {
        subject: `Balance of ${formatMoney(balance, business.currency)} due for order #${order.orderNumber}`,
        body: `Hi ${first},\n\nYour rental (${items}) starting ${formatDate(order.startDate)} has an outstanding balance of ${formatMoney(balance, business.currency)}. Please complete payment before pickup so we can hold your reservation.${sig}`,
      };
  }
}

/**
 * Asks Claude to write a personalised reminder. Falls back to the template
 * when no API key is configured or the call fails.
 */
async function composeMessage(business: Business, order: OrderWithDetails, type: ReminderType) {
  const fallback = templateMessage(business, order, type);
  const client = getClaude();
  if (!client) return { ...fallback, ai: false, error: null };

  const balance = order.total - paidAmount(order.payments);
  const context = [
    `Business: ${business.name}${business.tagline ? ` – ${business.tagline}` : ""}`,
    business.phone ? `Phone: ${business.phone}` : "",
    business.email ? `Email: ${business.email}` : "",
    business.address ? `Address: ${business.address}` : "",
    business.policies ? `Policies:\n${business.policies}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const orderText = [
    `Reminder type: ${TYPE_LABEL[type]}`,
    `Customer: ${order.customer.name}`,
    `Order #${order.orderNumber}`,
    `Items: ${order.items.map((l) => `${l.quantity}× ${l.item.name}`).join(", ")}`,
    `Pickup: ${formatDate(order.startDate)}`,
    `Return: ${formatDate(order.endDate)}`,
    `Fulfillment: ${order.fulfillment === "pickup" ? "customer picks up in store" : `deliver/serve at ${formatAddress(order)}`}`,
    order.customer.phone ? `Customer phone: ${order.customer.phone}` : "",
    `Order total: ${formatMoney(order.total, business.currency)}`,
    `Outstanding balance: ${formatMoney(balance, business.currency)}`,
    order.notes ? `Order notes: ${order.notes}` : "",
    `Today: ${formatDate(new Date())}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      output_config: { effort: "medium" },
      system: [
        {
          type: "text",
          text: `You write short, warm, professional customer emails for a rental business. Write in plain text (no markdown). Keep it under 120 words. Never invent facts or policies that aren't in the context. Output exactly this format:\nSubject: <subject line>\n\n<email body>`,
          cache_control: { type: "ephemeral" },
        },
        { type: "text", text: context },
      ],
      messages: [{ role: "user", content: `Write the reminder email.\n\n${orderText}` }],
    });
    if (response.stop_reason === "refusal") {
      return { ...fallback, ai: false, error: "Claude declined to write this message" };
    }
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const m = /^Subject:\s*(.+?)\n+([\s\S]+)$/.exec(text);
    if (!m) return { ...fallback, ai: false, error: "Unexpected AI output format" };
    return { subject: m[1].trim(), body: m[2].trim(), ai: true, error: null };
  } catch (error) {
    return { ...fallback, ai: false, error: describeAiError(error) };
  }
}

export async function sendReminder(reminderId: string) {
  const reminder = await prisma.reminder.findUniqueOrThrow({
    where: { id: reminderId },
    include: { customer: true },
  });
  try {
    const result = await sendEmail({
      to: reminder.customer.email,
      subject: reminder.subject,
      text: reminder.body,
    });
    return prisma.reminder.update({
      where: { id: reminderId },
      data: { status: "sent", sentAt: new Date(), deliveryNote: result.note },
    });
  } catch (error) {
    return prisma.reminder.update({
      where: { id: reminderId },
      data: { status: "failed", deliveryNote: error instanceof Error ? error.message : "Send failed" },
    });
  }
}

export type AgentRunResult = {
  created: number;
  sent: number;
  usedAi: boolean;
  summary: string;
  errors: string[];
};

/**
 * The reminder agent: scans orders, drafts any reminders that are due, and
 * sends them when the business has auto-send enabled.
 */
export async function runReminderAgent(businessId: string, trigger: "manual" | "cron" | "schedule"): Promise<AgentRunResult> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const now = new Date();
  const orders = (await prisma.order.findMany({
    where: { businessId, status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] } },
    include: { customer: true, items: { include: { item: true } }, payments: { select: { status: true, amount: true } } },
  })) as OrderWithDetails[];

  const existing = await prisma.reminder.findMany({
    where: { businessId, orderId: { in: orders.map((o) => o.id) } },
    select: { orderId: true, type: true },
  });
  const seen = new Set(existing.map((r) => `${r.orderId}:${r.type}`));

  let created = 0;
  let sent = 0;
  let usedAi = false;
  const errors: string[] = [];
  const lines: string[] = [];

  for (const order of orders) {
    for (const type of dueReminders(business, order, now)) {
      if (seen.has(`${order.id}:${type}`)) continue;
      const msg = await composeMessage(business, order, type);
      if (msg.ai) usedAi = true;
      if (msg.error) errors.push(`#${order.orderNumber} ${type}: ${msg.error}`);
      const reminder = await prisma.reminder.create({
        data: {
          businessId,
          orderId: order.id,
          customerId: order.customerId,
          type,
          channel: "email",
          scheduledFor: now,
          subject: msg.subject,
          body: msg.body,
          aiGenerated: msg.ai,
          status: business.autoSendReminders ? "approved" : "draft",
        },
      });
      created++;
      lines.push(`${TYPE_LABEL[type]} for order #${order.orderNumber} (${order.customer.name})`);
      if (business.autoSendReminders) {
        const r = await sendReminder(reminder.id);
        if (r.status === "sent") sent++;
      }
    }
  }

  const summary =
    created === 0
      ? `Checked ${orders.length} open order${orders.length === 1 ? "" : "s"}. Nothing new is due.`
      : `Checked ${orders.length} open orders. Drafted ${created}: ${lines.join("; ")}.` +
        (business.autoSendReminders ? ` Auto-sent ${sent}.` : " Waiting for your approval.");

  await prisma.agentRun.create({
    data: { businessId, trigger, summary, created, sent, usedAi },
  });

  return { created, sent, usedAi, summary, errors };
}

/** Runs the agent for every business. Used by the cron endpoint and the in-process scheduler. */
export async function runReminderAgentForAll(trigger: "cron" | "schedule") {
  const businesses = await prisma.business.findMany({ select: { id: true, name: true } });
  const results: { business: string; result: AgentRunResult }[] = [];
  for (const b of businesses) {
    results.push({ business: b.name, result: await runReminderAgent(b.id, trigger) });
  }
  return results;
}
