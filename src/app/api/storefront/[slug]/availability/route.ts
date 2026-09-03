import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseDateInput, rentalDays } from "@/lib/format";
import { getAvailability } from "@/lib/orders";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const start = parseDateInput(url.searchParams.get("start") ?? "");
  const end = parseDateInput(url.searchParams.get("end") ?? "");
  if (!start || !end || end < start) return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await prisma.item.findMany({ where: { businessId: business.id, active: true }, select: { id: true } });
  const availability = await getAvailability(business.id, items.map((i) => i.id), start, end);
  return NextResponse.json({ days: rentalDays(start, end), items: Object.fromEntries(availability) });
}
