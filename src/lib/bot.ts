import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Business } from "@prisma/client";
import { prisma } from "./db";
import { CLAUDE_MODEL, describeAiError, getClaude } from "./ai";
import { formatDate, formatMoney, parseDateInput, rentalDays } from "./format";
import { AvailabilityError, buildQuote, createOrder, getAvailability, paidAmount } from "./orders";
import { STATUS_LABEL } from "./format";
import { socialLinks } from "./social";
import { notifyOwnerNewOrder, sendOrderConfirmation } from "./notifications";
import { appUrl } from "./stripe";

const HISTORY_LIMIT = 20;

export type BotReply = { text: string; escalated: boolean; usedAi: boolean };

/**
 * Answers a storefront visitor. Uses Claude with tools (inventory, availability,
 * order lookup, booking) when an API key is configured; otherwise a rule-based
 * responder keeps the widget useful in demo mode.
 */
export async function answerCustomer(business: Business, conversationId: string, userMessage: string): Promise<BotReply> {
  const client = getClaude();
  if (!client) return ruleBasedReply(business, userMessage);

  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
  });

  const items = await prisma.item.findMany({
    where: { businessId: business.id, active: true },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  let escalated = false;

  const listInventory = betaZodTool({
    name: "list_inventory",
    description: "List everything the business rents, with daily prices and deposits.",
    inputSchema: z.object({}),
    run: async () =>
      items.length === 0
        ? "No items are listed yet."
        : items
            .map(
              (i) =>
                `- ${i.name}${i.category ? ` [${i.category.name}]` : ""}: ${formatMoney(i.pricePerDay, business.currency)}/day, deposit ${formatMoney(i.deposit, business.currency)}, ${i.quantity} unit(s) total, min ${i.minDays} day(s). ${i.description}`,
            )
            .join("\n"),
  });

  const checkAvailability = betaZodTool({
    name: "check_availability",
    description: "Check how many units of an item are free between two dates and quote the price.",
    inputSchema: z.object({
      item_name: z.string().describe("Name of the item, as listed in inventory"),
      start_date: z.string().describe("Pickup date, YYYY-MM-DD"),
      end_date: z.string().describe("Return date, YYYY-MM-DD"),
      quantity: z.number().int().min(1).default(1),
    }),
    run: async (input) => {
      const item = items.find((i) => i.name.toLowerCase() === input.item_name.toLowerCase()) ??
        items.find((i) => i.name.toLowerCase().includes(input.item_name.toLowerCase()));
      if (!item) return `No item called "${input.item_name}". Use list_inventory to see names.`;
      const start = parseDateInput(input.start_date);
      const end = parseDateInput(input.end_date);
      if (!start || !end) return "Dates must be YYYY-MM-DD.";
      if (end < start) return "Return date is before pickup date.";
      const avail = await getAvailability(business.id, [item.id], start, end);
      const free = avail.get(item.id) ?? 0;
      const quote = await buildQuote(business.id, [{ itemId: item.id, quantity: input.quantity }], start, end);
      return JSON.stringify({
        item: item.name,
        available_units: free,
        requested: input.quantity,
        ok: free >= input.quantity,
        days: rentalDays(start, end),
        rental_cost: formatMoney(quote.subtotal, business.currency),
        deposit: formatMoney(quote.deposit, business.currency),
        tax: formatMoney(quote.tax, business.currency),
        total: formatMoney(quote.total, business.currency),
      });
    },
  });

  const getOrderStatus = betaZodTool({
    name: "get_order_status",
    description: "Look up an order. Requires the order number AND the customer's email for verification.",
    inputSchema: z.object({
      order_number: z.number().int(),
      email: z.string(),
    }),
    run: async (input) => {
      const order = await prisma.order.findFirst({
        where: { businessId: business.id, orderNumber: input.order_number },
        include: { customer: true, items: { include: { item: true } }, payments: true },
      });
      if (!order || order.customer.email.toLowerCase() !== input.email.trim().toLowerCase()) {
        return "No order found with that number and email.";
      }
      return JSON.stringify({
        order_number: order.orderNumber,
        status: STATUS_LABEL[order.status] ?? order.status,
        pickup: formatDate(order.startDate),
        return: formatDate(order.endDate),
        items: order.items.map((l) => `${l.quantity}× ${l.item.name}`),
        total: formatMoney(order.total, business.currency),
        paid: formatMoney(paidAmount(order.payments), business.currency),
        balance_due: formatMoney(order.total - paidAmount(order.payments), business.currency),
      });
    },
  });

  const createBooking = betaZodTool({
    name: "create_booking_request",
    description:
      "Create a pending reservation once the customer has confirmed the items, dates, name and email. Only call after the customer explicitly says to book.",
    inputSchema: z.object({
      customer_name: z.string(),
      customer_email: z.string(),
      customer_phone: z.string().optional(),
      start_date: z.string().describe("YYYY-MM-DD"),
      end_date: z.string().describe("YYYY-MM-DD"),
      lines: z.array(z.object({ item_name: z.string(), quantity: z.number().int().min(1) })).min(1),
      fulfillment: z.enum(["delivery", "pickup"]).describe("delivery = deliver/serve at the customer's address; pickup = customer collects in store"),
      address_line1: z.string().optional().describe("Street address, required for delivery"),
      city: z.string().optional(),
      region: z.string().optional(),
      postal_code: z.string().optional(),
      notes: z.string().optional(),
    }),
    run: async (input) => {
      const start = parseDateInput(input.start_date);
      const end = parseDateInput(input.end_date);
      if (!start || !end) return "Dates must be YYYY-MM-DD.";
      const lines: { itemId: string; quantity: number }[] = [];
      for (const l of input.lines) {
        const item = items.find((i) => i.name.toLowerCase() === l.item_name.toLowerCase());
        if (!item) return `Unknown item "${l.item_name}".`;
        lines.push({ itemId: item.id, quantity: l.quantity });
      }
      if (input.fulfillment === "delivery" && !(input.address_line1 && input.city)) {
        return "For delivery I need the street address and city (and postal code). Ask the customer, or offer pickup instead.";
      }
      try {
        const order = await createOrder({
          businessId: business.id,
          customer: { name: input.customer_name, email: input.customer_email, phone: input.customer_phone },
          lines,
          startDate: start,
          endDate: end,
          notes: input.notes,
          source: "bot",
          fulfillment: input.fulfillment,
          addressLine1: input.address_line1,
          city: input.city,
          region: input.region,
          postalCode: input.postal_code,
        });
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { customerId: order.customerId },
        });
        await Promise.all([
          sendOrderConfirmation(order.id, { payUrl: `${appUrl()}/s/${business.slug}/orders/${order.id}` }),
          notifyOwnerNewOrder(order.id),
        ]);
        return JSON.stringify({
          ok: true,
          order_number: order.orderNumber,
          total: formatMoney(order.total, business.currency),
          payment_link: `/s/${business.slug}/orders/${order.id}`,
          message: "Reservation created as PENDING. Customer should pay via the payment link to confirm.",
        });
      } catch (error) {
        if (error instanceof AvailabilityError) {
          return `Not available: ${error.shortages.map((s) => `${s.name} (wanted ${s.requested}, only ${s.available} free)`).join(", ")}`;
        }
        return `Could not create booking: ${error instanceof Error ? error.message : "unknown error"}`;
      }
    },
  });

  const escalate = betaZodTool({
    name: "escalate_to_human",
    description: "Flag this conversation for a staff member when the customer asks for a human, is upset, or the request is outside what you can do.",
    inputSchema: z.object({ reason: z.string() }),
    run: async (input) => {
      escalated = true;
      await prisma.conversation.update({ where: { id: conversationId }, data: { escalated: true } });
      return `Flagged for staff: ${input.reason}. Tell the customer someone will follow up${business.email ? ` at ${business.email}` : ""}.`;
    },
  });

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: `You are ${business.botName}, the customer-service assistant for ${business.name}, a rental business. Be concise, friendly and accurate. Use the tools to check inventory, availability, prices and orders instead of guessing. Never reveal other customers' details. Only create a booking after the customer has confirmed items, dates, their name, email and phone number, and either a full delivery/service address or that they will pick up in store. If you can't help or the customer asks for a person, use escalate_to_human. Answer in plain text without markdown. Today's date is ${formatDate(new Date())}.`,
    },
    {
      type: "text",
      text:
        `Business details:\n${business.name}${business.tagline ? ` – ${business.tagline}` : ""}\n${business.description}\n` +
        (business.phone ? `Phone: ${business.phone}\n` : "") +
        (business.email ? `Email: ${business.email}\n` : "") +
        (business.address ? `Address: ${business.address}\n` : "") +
        (socialLinks(business).length ? `Social: ${socialLinks(business).map((s) => `${s.label} ${s.url}`).join(", ")}\n` : "") +
        `Currency: ${business.currency}\n\nPolicies & FAQ:\n${business.policies || "(none provided)"}`,
      cache_control: { type: "ephemeral" },
    },
  ];

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userMessage },
  ];

  try {
    const finalMessage = await client.beta.messages.toolRunner({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      output_config: { effort: "medium" },
      system,
      tools: [listInventory, checkAvailability, getOrderStatus, createBooking, escalate],
      messages,
      max_iterations: 8,
    });
    if (finalMessage.stop_reason === "refusal") {
      return { text: "I'm not able to help with that request. Let me flag this for our team.", escalated: true, usedAi: true };
    }
    const text = finalMessage.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { text: text || "Sorry, I didn't catch that. Could you rephrase?", escalated, usedAi: true };
  } catch (error) {
    console.error("bot error", describeAiError(error));
    return ruleBasedReply(business, userMessage);
  }
}

/** Demo-mode responder used when no Claude API key is configured. */
async function ruleBasedReply(business: Business, userMessage: string): Promise<BotReply> {
  const q = userMessage.toLowerCase();
  const contact = [business.phone && `call ${business.phone}`, business.email && `email ${business.email}`]
    .filter(Boolean)
    .join(" or ");

  if (/human|person|staff|agent|someone/.test(q)) {
    return {
      text: `I've flagged this for our team${contact ? ` – you can also ${contact}` : ""}.`,
      escalated: true,
      usedAi: false,
    };
  }
  if (/price|cost|how much|rate|rent/.test(q) || /available|availability|in stock/.test(q)) {
    const items = await prisma.item.findMany({ where: { businessId: business.id, active: true }, orderBy: { name: "asc" }, take: 8 });
    if (items.length === 0) return { text: "We haven't listed any items yet. Please check back soon!", escalated: false, usedAi: false };
    return {
      text:
        "Here's what we rent:\n" +
        items.map((i) => `• ${i.name} – ${formatMoney(i.pricePerDay, business.currency)}/day`).join("\n") +
        "\n\nPick your dates on the storefront to see live availability and book online.",
      escalated: false,
      usedAi: false,
    };
  }
  if (/order|status|booking|reservation/.test(q)) {
    return {
      text: "You can view any order from the confirmation link in your email. Share your order number and email and a team member will look it up for you.",
      escalated: true,
      usedAi: false,
    };
  }
  if (/hour|open|policy|policies|deposit|cancel|late|refund|return/.test(q) && business.policies) {
    return { text: `Here are our policies:\n\n${business.policies.slice(0, 900)}`, escalated: false, usedAi: false };
  }
  return {
    text: `Thanks for reaching out to ${business.name}! I can help with prices, availability and orders. Ask me something like "how much is a tent per day?"${contact ? ` For anything else, ${contact}.` : ""}`,
    escalated: false,
    usedAi: false,
  };
}
