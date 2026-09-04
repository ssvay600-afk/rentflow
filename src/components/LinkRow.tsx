"use client";

import { useRouter } from "next/navigation";

/**
 * A table row that navigates to `href` when clicked anywhere on it.
 * Clicks on nested links/buttons/forms keep their own behaviour.
 */
export function LinkRow({ href, className = "", children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const isInteractive = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest("a, button, input, select, textarea, form, label"));

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={(e) => {
        if (isInteractive(e.target)) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isInteractive(e.target)) {
          e.preventDefault();
          router.push(href);
        }
      }}
      className={`cursor-pointer transition hover:bg-teal-50/60 focus:bg-teal-50/60 focus:outline-none ${className}`}
    >
      {children}
    </tr>
  );
}
