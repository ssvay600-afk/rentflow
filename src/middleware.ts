import { NextResponse, type NextRequest } from "next/server";

/**
 * Custom-domain routing: a request to a business's own domain is rewritten to
 * that business's storefront under /s/<slug>. Platform hosts pass through.
 * The slug lookup goes through an internal API (middleware can't use Prisma)
 * and is cached in memory for a few minutes.
 */

const cache = new Map<string, { slug: string | null; at: number }>();
const TTL = 5 * 60_000;

function isPlatformHost(host: string, appHost: string) {
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".vercel.app") || host === appHost;
}

async function resolveSlug(req: NextRequest, host: string): Promise<string | null> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < TTL) return hit.slug;
  try {
    const url = new URL(`/api/domains/resolve?host=${encodeURIComponent(host)}`, req.nextUrl.origin);
    const res = await fetch(url, { headers: { "x-internal": "1" } });
    const data = res.ok ? ((await res.json()) as { slug: string | null }) : { slug: null };
    cache.set(host, { slug: data.slug, at: Date.now() });
    return data.slug;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  let appHost = "localhost";
  try {
    appHost = new URL(process.env.APP_URL ?? "http://localhost:3000").hostname.toLowerCase();
  } catch {}
  if (!host || isPlatformHost(host, appHost)) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // Already-namespaced paths (storefront links, APIs, assets) pass through unchanged.
  if (pathname.startsWith("/s/") || pathname.startsWith("/api/") || pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const slug = await resolveSlug(req, host);
  if (!slug) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/s/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
