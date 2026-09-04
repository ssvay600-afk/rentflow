import { socialLinks } from "@/lib/social";

function Icon({ kind }: { kind: "facebook" | "instagram" | "tiktok" }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;
  switch (kind) {
    case "facebook":
      return (
        <svg {...common}>
          <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.8.1-1.1 0-1.6.2-2 .4-.5.2-.8.4-1.2.8-.4.4-.6.7-.8 1.2-.2.4-.3.9-.4 2C2.8 9.7 2.8 10.1 2.8 12s0 2.3.1 4.5c0 1.1.2 1.6.4 2 .2.5.4.8.8 1.2.4.4.7.6 1.2.8.4.2.9.3 2 .4 1.3.1 1.7.1 4.8.1s3.5 0 4.8-.1c1.1 0 1.6-.2 2-.4.5-.2.8-.4 1.2-.8.4-.4.6-.7.8-1.2.2-.4.3-.9.4-2 .1-1.3.1-1.7.1-4.8s0-3.5-.1-4.8c0-1.1-.2-1.6-.4-2-.2-.5-.4-.8-.8-1.2-.4-.4-.7-.6-1.2-.8-.4-.2-.9-.3-2-.4C15.5 4 15.1 4 12 4zm0 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zm5.3-2.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-1.8-2.5V9.7a5.7 5.7 0 1 0 4.9 5.7V9.3a7.4 7.4 0 0 0 4.3 1.4V7.6a4.3 4.3 0 0 1-3.2-1.8z" />
        </svg>
      );
  }
}

export function SocialIcons({
  business,
  className = "",
  size = "md",
}: {
  business: { facebookUrl: string; instagramUrl: string; tiktokUrl: string; name: string };
  className?: string;
  size?: "sm" | "md";
}) {
  const links = socialLinks(business);
  if (links.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {links.map((s) => (
        <a
          key={s.kind}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${business.name} on ${s.label}`}
          title={s.label}
          className={`inline-flex items-center justify-center rounded-full text-slate-500 transition hover:text-slate-900 ${size === "sm" ? "h-8 w-8" : "h-9 w-9 bg-white/70 hover:bg-white"}`}
        >
          <Icon kind={s.kind} />
        </a>
      ))}
    </span>
  );
}
