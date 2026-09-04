/**
 * Custom domains for storefronts, backed by the Vercel Domains API.
 *
 * Env: VERCEL_TOKEN (API token), VERCEL_PROJECT_ID, VERCEL_TEAM_ID (optional).
 * Without a token the domain is still saved and DNS instructions shown, and a
 * platform admin adds the domain to the Vercel project by hand.
 */

const API = "https://api.vercel.com";

export function vercelDomainsConfigured() {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);
}

/** Lower-cases, strips protocol/path/www-less duplicates, validates a hostname. */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return null;
  return d;
}

export function isApexDomain(domain: string) {
  return domain.split(".").length === 2;
}

/** DNS records the business must create at their registrar. */
export function dnsInstructions(domain: string) {
  return isApexDomain(domain)
    ? [{ type: "A", name: "@", value: "76.76.21.21" }]
    : [{ type: "CNAME", name: domain.split(".")[0], value: "cname.vercel-dns.com" }];
}

/** Hosts that belong to the platform itself (never treated as custom domains). */
export function isPlatformHost(host: string) {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".vercel.app")) return true;
  try {
    const appHost = new URL(process.env.APP_URL ?? "http://localhost:3000").hostname.toLowerCase();
    if (h === appHost) return true;
  } catch {}
  return false;
}

function headers() {
  return { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "Content-Type": "application/json" };
}

function q() {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}

export type DomainStatus = {
  registered: boolean; // added to the Vercel project
  verified: boolean; // ownership verified by Vercel
  configured: boolean; // DNS points at Vercel
  verification: { type: string; domain: string; value: string }[];
  error?: string;
};

export async function addDomainToVercel(domain: string): Promise<{ ok: boolean; error?: string }> {
  if (!vercelDomainsConfigured()) return { ok: true };
  const res = await fetch(`${API}/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains${q()}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: domain }),
  });
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  const code = body?.error?.code;
  if (code === "domain_already_in_use" || code === "domain_already_exists") return { ok: true };
  return { ok: false, error: body?.error?.message ?? `Vercel API error ${res.status}` };
}

export async function removeDomainFromVercel(domain: string) {
  if (!vercelDomainsConfigured()) return;
  await fetch(`${API}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${domain}${q()}`, { method: "DELETE", headers: headers() }).catch(() => {});
}

export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  if (!vercelDomainsConfigured()) return { registered: false, verified: false, configured: false, verification: [] };
  const [proj, config] = await Promise.all([
    fetch(`${API}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${domain}${q()}`, { headers: headers(), cache: "no-store" }),
    fetch(`${API}/v6/domains/${domain}/config${q()}`, { headers: headers(), cache: "no-store" }),
  ]);
  if (proj.status === 404) return { registered: false, verified: false, configured: false, verification: [] };
  const p = await proj.json().catch(() => ({}));
  const c = await config.json().catch(() => ({}));
  if (!proj.ok) return { registered: false, verified: false, configured: false, verification: [], error: p?.error?.message };
  // Vercel asks for a TXT record when the domain is claimed by another account.
  const verification = Array.isArray(p.verification) ? p.verification.map((v: { type: string; domain: string; value: string }) => ({ type: v.type, domain: v.domain, value: v.value })) : [];
  return { registered: true, verified: Boolean(p.verified), configured: c?.misconfigured === false, verification };
}

// ---------------------------------------------------------------------------
// Buying domains through Vercel's Registrar API
// ---------------------------------------------------------------------------

const REGISTRAR = `${API}/v1/registrar`;

/** TLDs offered in search, in display order. */
export const SEARCH_TLDS = ["com", "net", "co", "rentals", "shop", "store", "events", "party"];

export const DOMAIN_MARKUP_PERCENT = Number(process.env.DOMAIN_MARKUP_PERCENT ?? 25);

/** What the business pays: registrar price plus markup, rounded up to the next $0.50. */
export function domainRetailPrice(vercelCents: number) {
  const marked = vercelCents * (1 + DOMAIN_MARKUP_PERCENT / 100);
  return Math.ceil(marked / 50) * 50;
}

export type DomainSearchResult = {
  domain: string;
  available: boolean;
  vercelPrice: number; // cents
  renewalPrice: number; // cents
  price: number; // cents, retail
};

function toCents(v: unknown) {
  return Math.round(Number(v ?? 0) * 100);
}

/** Splits "my-shop.com" into ["my-shop", "com"]; bare words get no TLD. */
export function splitDomainQuery(raw: string): { label: string; tld: string | null } | null {
  const q = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[^a-z0-9.-]/g, "");
  if (!q) return null;
  const parts = q.split(".").filter(Boolean);
  const label = parts[0]?.replace(/^-+|-+$/g, "");
  if (!label || label.length < 2 || label.length > 63) return null;
  return { label, tld: parts.length > 1 ? parts.slice(1).join(".") : null };
}

export async function searchDomains(raw: string): Promise<{ results: DomainSearchResult[]; error?: string }> {
  if (!vercelDomainsConfigured()) return { results: [], error: "Domain purchasing isn't configured on this install." };
  const parsed = splitDomainQuery(raw);
  if (!parsed) return { results: [], error: "Enter a name like myrentals or myrentals.com" };
  const tlds = parsed.tld ? [parsed.tld, ...SEARCH_TLDS.filter((t) => t !== parsed.tld)] : SEARCH_TLDS;
  const domains = tlds.map((t) => `${parsed.label}.${t}`);

  const avail = await fetch(`${REGISTRAR}/domains/availability${q()}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ domains }),
    cache: "no-store",
  });
  if (!avail.ok) {
    const body = await avail.json().catch(() => ({}));
    return { results: [], error: body?.error?.message ?? `Availability check failed (${avail.status})` };
  }
  const { results } = (await avail.json()) as { results: { domain: string; available: boolean }[] };

  const priced = await Promise.all(
    results.map(async (r) => {
      if (!r.available) return { domain: r.domain, available: false, vercelPrice: 0, renewalPrice: 0, price: 0 };
      const res = await fetch(`${REGISTRAR}/domains/${r.domain}/price?years=1${q() ? "&" + q().slice(1) : ""}`, { headers: headers(), cache: "no-store" });
      if (!res.ok) return { domain: r.domain, available: false, vercelPrice: 0, renewalPrice: 0, price: 0 };
      const p = (await res.json()) as { purchasePrice: number; renewalPrice: number };
      const vercelPrice = toCents(p.purchasePrice);
      return { domain: r.domain, available: true, vercelPrice, renewalPrice: toCents(p.renewalPrice), price: domainRetailPrice(vercelPrice) };
    }),
  );
  // Keep the requested TLD first, then cheapest available.
  return { results: priced.sort((a, b) => (a.domain === domains[0] ? -1 : b.domain === domains[0] ? 1 : Number(b.available) - Number(a.available) || a.price - b.price)) };
}

export type RegistrantContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string; // ISO-2
  companyName?: string;
};

/** Registrars want E.164-style phones ("+1.5551234567"). */
export function normalizePhone(raw: string, country: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    const cc = digits.slice(1, digits.length - 10) || "1";
    return `+${cc}.${digits.slice(1 + cc.length)}`;
  }
  const cc = country.toUpperCase() === "US" || country.toUpperCase() === "CA" ? "1" : "1";
  return `+${cc}.${digits.replace(/^1(?=\d{10}$)/, "")}`;
}

/** Re-quotes the exact registrar price right before charging/buying. */
export async function quoteDomain(domain: string, years = 1) {
  const res = await fetch(`${REGISTRAR}/domains/${domain}/price?years=${years}${q() ? "&" + q().slice(1) : ""}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Could not price ${domain}`);
  const p = (await res.json()) as { purchasePrice: number; renewalPrice: number };
  const availRes = await fetch(`${REGISTRAR}/domains/${domain}/availability${q()}`, { headers: headers(), cache: "no-store" });
  const a = availRes.ok ? ((await availRes.json()) as { available: boolean }) : { available: false };
  return { available: a.available, vercelPrice: toCents(p.purchasePrice), renewalPrice: toCents(p.renewalPrice) };
}

export async function buyDomain(domain: string, years: number, expectedPriceCents: number, contact: RegistrantContact) {
  const res = await fetch(`${REGISTRAR}/domains/${domain}/buy${q()}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      autoRenew: false,
      years,
      expectedPrice: expectedPriceCents / 100,
      contactInformation: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        address1: contact.address1,
        ...(contact.address2 ? { address2: contact.address2 } : {}),
        city: contact.city,
        state: contact.state,
        zip: contact.zip,
        country: contact.country.toUpperCase(),
        ...(contact.companyName ? { companyName: contact.companyName } : {}),
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Purchase failed (${res.status})`);
  return body.orderId as string;
}

export type DomainOrderStatus = "draft" | "purchasing" | "completed" | "failed";

export async function getDomainOrder(orderId: string): Promise<{ status: DomainOrderStatus; error?: string }> {
  const res = await fetch(`${REGISTRAR}/orders/${orderId}${q()}`, { headers: headers(), cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { status: "purchasing", error: body?.error?.message };
  const err = body.error && typeof body.error === "object" ? body.error.message : body.error;
  return { status: body.status, error: err ? String(err) : undefined };
}
