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
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (business.suspended) return NextResponse.json({ error: "This business is not accepting bookings right now." }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  const { start, end, lines, customer } = parsed.data;
  const startDate = parseDateInput(start);
  const endDate = parseDateInput(end);
  if (!startDate || !endDate || endDate < startDate) return NextResponse.json({ error: "Invalid dates." }, { status: 400 });

  try {
    const order = await createOrder({
      businessId: business.id,
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      lines,
      startDate,
      endDate,
      notes: customer.notes,
      source: "storefront",
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
