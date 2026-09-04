import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Maps a custom domain host to a storefront slug (used by middleware). */
export async function GET(req: Request) {
  const host = new URL(req.url).searchParams.get("host")?.toLowerCase().replace(/:\d+$/, "") ?? "";
  if (!host) return NextResponse.json({ slug: null }, { status: 400 });
  const candidates = host.startsWith("www.") ? [host, host.slice(4)] : [host, `www.${host}`];
  const business = await prisma.business.findFirst({
    where: { customDomain: { in: candidates }, suspended: false },
    select: { slug: true },
  });
  return NextResponse.json(
    { slug: business?.slug ?? null },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
