"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireBusiness } from "@/lib/auth";
import { ORDER_STATUSES, nextStatuses, parseDateInput, slugify } from "@/lib/format";
import { AvailabilityError, createOrder } from "@/lib/orders";
import { runReminderAgent, sendReminder as deliverReminder } from "@/lib/reminders";

export type ActionState = { error?: string; success?: string };

function refresh() {
  revalidatePath("/dashboard", "layout");
}

function dollarsToCents(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function updateOrderStatus(orderId: string, status: string) {
  const { business } = await requireBusiness();
  const order = await prisma.order.findFirst({ where: { id: orderId, businessId: business.id } });
  if (!order) throw new Error("Order not found");
  if (!(ORDER_STATUSES as readonly string[]).includes(status) || !nextStatuses(order.status).includes(status as never)) {
    throw new Error(`Cannot move order from ${order.status} to ${status}`);
  }
  await prisma.order.update({ where: { id: orderId }, data: { status } });
  refresh();
}

export async function updateOrderNotes(orderId: string, formData: FormData) {
  const { business } = await requireBusiness();
  await prisma.order.updateMany({
    where: { id: orderId, businessId: business.id },
    data: { notes: String(formData.get("notes") ?? "") },
  });
  refresh();
}

export async function createManualOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { business } = await requireBusiness();
  const startDate = parseDateInput(String(formData.get("startDate") ?? ""));
  const endDate = parseDateInput(String(formData.get("endDate") ?? ""));
  if (!startDate || !endDate) return { error: "Pickup and return dates are required." };
  const lines: { itemId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("qty_")) {
      const quantity = Number(value);
      if (quantity > 0) lines.push({ itemId: key.slice(4), quantity });
    }
  }
  if (lines.length === 0) return { error: "Add at least one item." };
  const name = String(formData.get("customerName") ?? "").trim();
  const email = String(formData.get("customerEmail") ?? "").trim();
  if (!name || !email) return { error: "Customer name and email are required." };
  let orderId: string;
  try {
    const order = await createOrder({
      businessId: business.id,
      customer: { name, email, phone: String(formData.get("customerPhone") ?? "").trim() },
      lines,
      startDate,
      endDate,
      notes: String(formData.get("notes") ?? ""),
      source: "manual",
      status: formData.get("confirm") ? "CONFIRMED" : "PENDING",
    });
    orderId = order.id;
  } catch (error) {
    if (error instanceof AvailabilityError) {
      return {
        error: `Not enough stock: ${error.shortages.map((s) => `${s.name} (need ${s.requested}, ${s.available} free)`).join(", ")}`,
      };
    }
    return { error: error instanceof Error ? error.message : "Could not create order." };
  }
  refresh();
  redirect(`/dashboard/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function recordPayment(orderId: string, formData: FormData) {
  const { business } = await requireBusiness();
  const order = await prisma.order.findFirst({ where: { id: orderId, businessId: business.id } });
  if (!order) throw new Error("Order not found");
  const amount = dollarsToCents(formData.get("amount"));
  if (amount <= 0) throw new Error("Amount must be positive");
  await prisma.payment.create({
    data: {
      businessId: business.id,
      orderId,
      amount,
      currency: business.currency,
      method: String(formData.get("method") ?? "cash"),
      status: "paid",
      note: String(formData.get("note") ?? ""),
      paidAt: new Date(),
    },
  });
  if (order.status === "PENDING") {
    await prisma.order.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
  }
  refresh();
}

export async function refundPayment(paymentId: string) {
  const { business } = await requireBusiness();
  await prisma.payment.updateMany({
    where: { id: paymentId, businessId: business.id, status: "paid" },
    data: { status: "refunded" },
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export async function saveItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { business } = await requireBusiness();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  const pricePerDay = dollarsToCents(formData.get("pricePerDay"));
  if (pricePerDay <= 0) return { error: "Price per day must be greater than zero." };
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const data = {
    name,
    sku: String(formData.get("sku") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    imageUrl: String(formData.get("imageUrl") ?? "").trim(),
    pricePerDay,
    deposit: dollarsToCents(formData.get("deposit")),
    quantity: Math.max(0, Number(formData.get("quantity") ?? 1) || 0),
    minDays: Math.max(1, Number(formData.get("minDays") ?? 1) || 1),
    active: formData.get("active") === "on",
    categoryId,
  };

  if (id) {
    const existing = await prisma.item.findFirst({ where: { id, businessId: business.id } });
    if (!existing) return { error: "Item not found." };
    await prisma.item.update({ where: { id }, data });
  } else {
    let slug = slugify(name) || "item";
    const taken = await prisma.item.findUnique({ where: { businessId_slug: { businessId: business.id, slug } } });
    if (taken) slug = `${slug}-${Date.now().toString(36)}`;
    await prisma.item.create({ data: { ...data, slug, businessId: business.id } });
  }
  refresh();
  redirect("/dashboard/inventory");
}

export async function deleteItem(itemId: string) {
  const { business } = await requireBusiness();
  const inUse = await prisma.orderItem.count({ where: { itemId, order: { businessId: business.id } } });
  if (inUse > 0) {
    await prisma.item.updateMany({ where: { id: itemId, businessId: business.id }, data: { active: false } });
  } else {
    await prisma.item.deleteMany({ where: { id: itemId, businessId: business.id } });
  }
  refresh();
}

export async function addCategory(formData: FormData) {
  const { business } = await requireBusiness();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.category.upsert({
    where: { businessId_name: { businessId: business.id, name } },
    update: {},
    create: { businessId: business.id, name },
  });
  refresh();
}

export async function deleteCategory(categoryId: string) {
  const { business } = await requireBusiness();
  await prisma.category.deleteMany({ where: { id: categoryId, businessId: business.id } });
  refresh();
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function updateCustomerNotes(customerId: string, formData: FormData) {
  const { business } = await requireBusiness();
  await prisma.customer.updateMany({
    where: { id: customerId, businessId: business.id },
    data: { notes: String(formData.get("notes") ?? "") },
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Reminder agent
// ---------------------------------------------------------------------------

export async function runAgentNow() {
  const { business } = await requireBusiness();
  await runReminderAgent(business.id, "manual");
  refresh();
}

export async function sendReminderNow(reminderId: string) {
  const { business } = await requireBusiness();
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, businessId: business.id } });
  if (!reminder) throw new Error("Reminder not found");
  await deliverReminder(reminderId);
  refresh();
}

export async function skipReminder(reminderId: string) {
  const { business } = await requireBusiness();
  await prisma.reminder.updateMany({
    where: { id: reminderId, businessId: business.id, status: { in: ["draft", "approved", "failed"] } },
    data: { status: "skipped" },
  });
  refresh();
}

export async function updateReminderText(reminderId: string, formData: FormData) {
  const { business } = await requireBusiness();
  await prisma.reminder.updateMany({
    where: { id: reminderId, businessId: business.id },
    data: {
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
    },
  });
  refresh();
}

export async function saveReminderSettings(formData: FormData) {
  const { business } = await requireBusiness();
  await prisma.business.update({
    where: { id: business.id },
    data: {
      remindBeforeDays: Math.max(0, Number(formData.get("remindBeforeDays") ?? 1) || 0),
      remindOverdue: formData.get("remindOverdue") === "on",
      remindPaymentDue: formData.get("remindPaymentDue") === "on",
      autoSendReminders: formData.get("autoSendReminders") === "on",
    },
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------

export async function saveBotSettings(formData: FormData) {
  const { business } = await requireBusiness();
  await prisma.business.update({
    where: { id: business.id },
    data: {
      botEnabled: formData.get("botEnabled") === "on",
      botName: String(formData.get("botName") ?? "").trim() || "Rental Assistant",
      botGreeting: String(formData.get("botGreeting") ?? "").trim(),
      policies: String(formData.get("policies") ?? ""),
    },
  });
  refresh();
}

export async function resolveConversation(conversationId: string) {
  const { business } = await requireBusiness();
  await prisma.conversation.updateMany({
    where: { id: conversationId, businessId: business.id },
    data: { escalated: false },
  });
  refresh();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function saveBusinessSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { business } = await requireBusiness();
  const name = String(formData.get("name") ?? "").trim();
  const slug = slugify(String(formData.get("slug") ?? ""));
  if (!name) return { error: "Business name is required." };
  if (slug.length < 3) return { error: "Storefront link must be at least 3 characters." };
  const clash = await prisma.business.findFirst({ where: { slug, id: { not: business.id } } });
  if (clash) return { error: "That storefront link is already taken." };
  const color = String(formData.get("primaryColor") ?? "#0f766e");
  await prisma.business.update({
    where: { id: business.id },
    data: {
      name,
      slug,
      tagline: String(formData.get("tagline") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      logoUrl: String(formData.get("logoUrl") ?? "").trim(),
      heroImageUrl: String(formData.get("heroImageUrl") ?? "").trim(),
      primaryColor: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0f766e",
      currency: String(formData.get("currency") ?? "USD").toUpperCase().slice(0, 3),
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      taxRate: Math.max(0, Number(formData.get("taxRate") ?? 0) || 0),
      lowStockThreshold: Math.max(0, Number(formData.get("lowStockThreshold") ?? 2) || 0),
    },
  });
  refresh();
  return { success: "Settings saved." };
}
