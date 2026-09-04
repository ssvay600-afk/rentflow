export type SocialKind = "facebook" | "instagram" | "tiktok";

const BASE: Record<SocialKind, (handle: string) => string> = {
  facebook: (h) => `https://www.facebook.com/${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
};

/** Accepts a full URL or a bare handle ("@peakgear", "peakgear") and returns a canonical https URL, or "" when empty. */
export function normalizeSocial(kind: SocialKind, input: string): string {
  const v = input.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.)?(facebook|instagram|tiktok)\.com\//i.test(v)) return `https://${v.replace(/^www\./i, "www.")}`;
  const handle = v.replace(/^@/, "").replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(handle)) return "";
  return BASE[kind](handle);
}

export function socialLinks(b: { facebookUrl: string; instagramUrl: string; tiktokUrl: string }) {
  return [
    { kind: "facebook" as const, label: "Facebook", url: b.facebookUrl },
    { kind: "instagram" as const, label: "Instagram", url: b.instagramUrl },
    { kind: "tiktok" as const, label: "TikTok", url: b.tiktokUrl },
  ].filter((s) => s.url);
}
