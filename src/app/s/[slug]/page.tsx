import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Storefront } from "./Storefront";

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) notFound();
  const items = await prisma.item.findMany({
    where: { businessId: business.id, active: true },
    include: { category: true },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <main>
      <section className="relative overflow-hidden" style={{ background: business.heroImageUrl ? undefined : "var(--brand)" }}>
        {business.heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 text-white">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">{business.tagline || `Rent from ${business.name}`}</h1>
          {business.description && <p className="mt-4 max-w-xl text-lg text-white/85">{business.description}</p>}
          <a href="#book" className="mt-8 inline-flex rounded-lg bg-white px-5 py-3 text-sm font-medium text-slate-900 shadow hover:bg-slate-100">
            Check availability
          </a>
        </div>
      </section>

      <Storefront
        slug={business.slug}
        currency={business.currency}
        taxRate={business.taxRate}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          imageUrl: i.imageUrl,
          pricePerDay: i.pricePerDay,
          deposit: i.deposit,
          quantity: i.quantity,
          minDays: i.minDays,
          category: i.category?.name ?? "Other",
        }))}
      />
    </main>
  );
}
