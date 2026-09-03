import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

const FEATURES = [
  {
    title: "Your own storefront",
    body: "A branded booking site at your own link. Customers pick dates, see live availability and pay online.",
  },
  {
    title: "Orders & scheduling",
    body: "Pickups, returns, extensions and cancellations in one calendar-aware order pipeline.",
  },
  {
    title: "Payments",
    body: "Stripe Checkout for cards, plus manual cash and bank payments. Deposits and balances tracked per order.",
  },
  {
    title: "Inventory management",
    body: "Track units, pricing, deposits and categories. Availability is computed from real bookings, so you never double-book.",
  },
  {
    title: "AI reminder agent",
    body: "An agent drafts personalised pickup, return, overdue and payment reminders, and sends them on your schedule.",
  },
  {
    title: "AI customer service bot",
    body: "A chat assistant on your storefront that quotes prices, checks availability, looks up orders and books reservations.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold tracking-tight text-teal-800">RentFlow</span>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/s/peak-gear" className="text-slate-600 hover:text-slate-900">
            Demo storefront
          </Link>
          {user ? (
            <Link href="/dashboard" className="btn-primary">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-slate-600 hover:text-slate-900">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary">
                Start free
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 text-center">
        <p className="mb-4 inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
          Built for equipment, event, vehicle, tool and costume rentals
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Run your rental business from one website
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Create a storefront in minutes. RentFlow handles bookings, payments, inventory, automated reminders and
          customer support so you can focus on the gear.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">
            Create your storefront
          </Link>
          <Link href="/s/peak-gear" className="btn-secondary px-6 py-3 text-base">
            See a live example
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Demo login: <span className="font-mono">demo@rentflow.app</span> / <span className="font-mono">demo1234</span>
        </p>
      </section>

      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <h3 className="font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            ["Sign up & name your business", "Pick a link like rentflow.app/s/your-name and add your branding."],
            ["Add your inventory", "Items, prices, deposits and unit counts. Turn on the bot and reminders."],
            ["Share your storefront", "Customers book and pay online. You manage everything from the dashboard."],
          ].map(([t, b], i) => (
            <li key={t} className="rounded-xl border border-slate-200 p-5">
              <span className="text-xs font-semibold text-teal-700">STEP {i + 1}</span>
              <p className="mt-1 font-medium">{t}</p>
              <p className="mt-1 text-sm text-slate-600">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-500">
        RentFlow · Multi-tenant rental platform
      </footer>
    </main>
  );
}
