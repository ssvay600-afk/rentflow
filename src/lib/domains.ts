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
