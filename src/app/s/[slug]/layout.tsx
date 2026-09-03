import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/db";
import { ChatWidget } from "@/components/ChatWidget";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({ where: { slug } });
  return { title: business ? { absolute: business.name } : "Storefront" };
}

export default async function StorefrontLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) notFound();

  return (
    <div className="min-h-screen bg-white" style={{ "--brand": business.primaryColor } as CSSProperties}>
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href={`/s/${business.slug}`} className="flex items-center gap-3">
            {business.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: "var(--brand)" }}>
                {business.name.slice(0, 1)}
              </span>
            )}
            <span className="text-lg font-semibold tracking-tight">{business.name}</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600">
            {business.phone && <a href={`tel:${business.phone}`} className="hidden sm:inline">{business.phone}</a>}
            <Link href={`/s/${business.slug}#book`} className="btn-brand">Book now</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mt-16 border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 text-sm text-slate-600 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-900">{business.name}</p>
            {business.tagline && <p className="mt-1">{business.tagline}</p>}
          </div>
          <div>
            <p className="font-semibold text-slate-900">Contact</p>
            {business.email && <p className="mt-1">{business.email}</p>}
            {business.phone && <p>{business.phone}</p>}
            {business.address && <p>{business.address}</p>}
          </div>
          <div>
            <p className="font-semibold text-slate-900">Rental terms</p>
            <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{business.policies.slice(0, 400)}</p>
          </div>
        </div>
        <p className="pb-6 text-center text-xs text-slate-400">Powered by RentFlow</p>
      </footer>
      {business.botEnabled && <ChatWidget slug={business.slug} botName={business.botName} greeting={business.botGreeting} />}
    </div>
  );
}
