import { prisma } from "./db";
import { rentalDays } from "./format";

/** Statuses that hold inventory. */
export const RESERVING_STATUSES = ["PENDING", "CONFIRMED", "ACTIVE"];

export type QuoteLine = {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  days: number;
  lineTotal: number;
  deposit: number;
};

export type Quote = {
  days: number;
  lines: QuoteLine[];
  subtotal: number;
  deposit: number;
  tax: number;
  total: number;
};

/**
 * Units of each item still free for the given date range.
 * Counts overlapping orders that hold inventory (pending/confirmed/active).
 */
export async function getAvailability(
  businessId: string,
  itemIds: string[],
  start: Date,
  end: Date,
  excludeOrderId?: string,
) {
  if (itemIds.length === 0) return new Map<string, number>();
  const items = await prisma.item.findMany({
    where: { businessId, id: { in: itemIds } },
    select: { id: true, quantity: true },
  });
  const reserved = await prisma.orderItem.findMany({
    where: {
      itemId: { in: itemIds },
      order: {
        businessId,
        status: { in: RESERVING_STATUSES },
        startDate: { lte: end },
        endDate: { gte: start },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
    },
    select: { itemId: true, quantity: true },
  });
  const used = new Map<string, number>();
  for (const r of reserved) used.set(r.itemId, (used.get(r.itemId) ?? 0) + r.quantity);
  const result = new Map<string, number>();
  for (const it of items) result.set(it.id, Math.max(0, it.quantity - (used.get(it.id) ?? 0)));
  return result;
}

export async function buildQuote(
  businessId: string,
  lines: { itemId: string; quantity: number }[],
  start: Date,
  end: Date,
): Promise<Quote> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const items = await prisma.item.findMany({
    where: { businessId, id: { in: lines.map((l) => l.itemId) } },
  });
  const days = rentalDays(start, end);
  const quoteLines: QuoteLine[] = [];
  for (const line of lines) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) throw new Error("Item not found");
    if (line.quantity < 1) continue;
    const effectiveDays = Math.max(days, item.minDays);
    const lineTotal = item.pricePerDay * effectiveDays * line.quantity;
    quoteLines.push({
      itemId: item.id,
      name: item.name,
      quantity: line.quantity,
      unitPrice: item.pricePerDay,
      days: effectiveDays,
      lineTotal,
      deposit: item.deposit * line.quantity,
    });
  }
  const subtotal = quoteLines.reduce((s, l) => s + l.lineTotal, 0);
  const deposit = quoteLines.reduce((s, l) => s + l.deposit, 0);
  const tax = Math.round((subtotal * business.taxRate) / 100);
  return { days, lines: quoteLines, subtotal, deposit, tax, total: subtotal + tax + deposit };
}

export class AvailabilityError extends Error {
  constructor(public shortages: { name: string; requested: number; available: number }[]) {
    super("Some items are not available for those dates");
  }
}

export type ServiceAddress = {
  fulfillment?: "delivery" | "pickup";
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
};

export type CreateOrderInput = ServiceAddress & {
  businessId: string;
  customer: { name: string; email: string; phone?: string };
  lines: { itemId: string; quantity: number }[];
  startDate: Date;
  endDate: Date;
  notes?: string;
  source?: "storefront" | "manual" | "bot";
  status?: "PENDING" | "CONFIRMED";
};

/** Validates availability, upserts the customer, and creates the order in one transaction. */
export async function createOrder(input: CreateOrderInput) {
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) throw new Error("Order has no items");
  if (input.endDate < input.startDate) throw new Error("Return date must be after pickup date");

  const availability = await getAvailability(
    input.businessId,
    lines.map((l) => l.itemId),
    input.startDate,
    input.endDate,
  );
  const quote = await buildQuote(input.businessId, lines, input.startDate, input.endDate);
  const shortages = quote.lines
    .filter((l) => (availability.get(l.itemId) ?? 0) < l.quantity)
    .map((l) => ({ name: l.name, requested: l.quantity, available: availability.get(l.itemId) ?? 0 }));
  if (shortages.length) throw new AvailabilityError(shortages);

  const email = input.customer.email.trim().toLowerCase();
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { businessId_email: { businessId: input.businessId, email } },
      update: { name: input.customer.name, ...(input.customer.phone ? { phone: input.customer.phone } : {}) },
      create: {
        businessId: input.businessId,
        name: input.customer.name,
        email,
        phone: input.customer.phone ?? "",
      },
    });
    const last = await tx.order.findFirst({
      where: { businessId: input.businessId },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    const order = await tx.order.create({
      data: {
        businessId: input.businessId,
        customerId: customer.id,
        orderNumber: (last?.orderNumber ?? 1000) + 1,
        status: input.status ?? "PENDING",
        startDate: input.startDate,
        endDate: input.endDate,
        subtotal: quote.subtotal,
        deposit: quote.deposit,
        tax: quote.tax,
        total: quote.total,
        notes: input.notes ?? "",
        source: input.source ?? "storefront",
        fulfillment: input.fulfillment ?? "delivery",
        addressLine1: input.addressLine1?.trim() ?? "",
        addressLine2: input.addressLine2?.trim() ?? "",
        city: input.city?.trim() ?? "",
        region: input.region?.trim() ?? "",
        postalCode: input.postalCode?.trim() ?? "",
        items: {
          create: quote.lines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            days: l.days,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { items: { include: { item: true } }, customer: true },
    });
    return order;
  });
}

export function paidAmount(payments: { status: string; amount: number }[]) {
  return payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
}
