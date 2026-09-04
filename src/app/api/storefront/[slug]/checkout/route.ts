import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseDateInput } from "@/lib/format";
import { AvailabilityError, createOrder } from "@/lib/orders";
import { startPayment } from "@/lib/payments";

const Body = z.object({
  start: z.string(),
  end: z.string(),
  lines: z.array(z.object({ itemId: z.string(), quantity: z.number().int().min(1) })).min(1),
  customer: z.object({
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    phone: z.string().trim().min(5, "Phone number is required"),
    notes: z.string().optional(),
  }),
  fulfillment: z.enum(["delivery", "pickup"]).default("delivery"),
  address: z
    .object({
      line1: z.string().trim().default(""),
      line2: z.string().trim().default(""),
      city: z.string().trim().default(""),
      region: z.string().trim().default(""),
      postalCode: z.string().trim().default(""),
    })
    .default({ line1: "", line2: "", city: "", region: "", postalCode: "" }),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (business.suspended) return NextResponse.json({ error: "This business is not accepting bookings right now." }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message?.includes("Phone") ? first.message : "Please fill in all required fields." }, { status: 400 });
  }
  const { start, end, lines, customer, fulfillment, address } = parsed.data;
  const startDate = parseDateInput(start);
  const endDate = parseDateInput(end);
  if (!startDate || !endDate || endDate < startDate) return NextResponse.json({ error: "Invalid dates." }, { status: 400 });
  if (fulfillment === "delivery" && (!address.line1 || !address.city || !address.postalCode)) {
    return NextResponse.json({ error: "Please enter the full service address (street, city and postal code), or choose pickup." }, { status: 400 });
  }

  try {
    const order = await createOrder({
      businessId: business.id,
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      lines,
      startDate,
      endDate,
      notes: customer.notes,
      source: "storefront",
      fulfillment,
      addressLine1: address.line1,
      addressLine2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
    });
    const full = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { customer: true, payments: true } });
    const start = await startPayment(business, full);
    const payUrl =
      start.kind === "redirect" ? start.url : `/s/${slug}/orders/${order.id}${start.kind === "unavailable" ? "?unavailable=1" : ""}`;
    return NextResponse.json({ orderId: order.id, payUrl });
  } catch (error) {
    if (error instanceof AvailabilityError) {
      return NextResponse.json(
        { error: `Not available: ${error.shortages.map((s) => `${s.name} (only ${s.available} left)`).join(", ")}` },
        { status: 409 },
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Could not create your booking." }, { status: 500 });
  }
}
