import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function day(offset: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

async function main() {
  const email = "demo@rentflow.app";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Demo data already present – skipping seed.");
    return;
  }

  const user = await prisma.user.create({
    data: { email, name: "Demo Owner", passwordHash: await bcrypt.hash("demo1234", 10) },
  });

  const business = await prisma.business.create({
    data: {
      ownerId: user.id,
      slug: "peak-gear",
      name: "Peak Gear Rentals",
      tagline: "Camping & outdoor gear, ready when you are",
      description: "Family-run outdoor rental shop in Boulder. Tents, packs, stoves and paddleboards for weekend trips and long expeditions.",
      primaryColor: "#0f766e",
      currency: "USD",
      email: "hello@peakgear.example",
      phone: "+1 303 555 0142",
      address: "1200 Pearl St, Boulder, CO",
      taxRate: 8.5,
      heroImageUrl: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1600&q=70",
      policies: `Hours: Mon–Sat 9am–6pm, closed Sunday.
Pickup & return: Bring a photo ID at pickup. Returns are due by 6pm on the return date.
Deposits: Refundable deposits are released within 3 business days after gear is returned clean and undamaged.
Late returns: One extra day charged per day late.
Cancellations: Free cancellation up to 48 hours before pickup; 50% fee inside 48 hours.
Delivery: Free pickup in store. Delivery within Boulder for $25 on orders over $150.
Damage: Normal wear is fine. Tears, broken poles or lost parts are charged at repair cost, capped at the deposit.`,
      remindBeforeDays: 1,
      trialEndsAt: new Date(Date.now() + 365 * 86_400_000), // demo business never locks
      categories: {
        create: [{ name: "Tents & Shelter" }, { name: "Backpacks" }, { name: "Cooking" }, { name: "Water" }],
      },
    },
    include: { categories: true },
  });
  const cat = (name: string) => business.categories.find((c) => c.name === name)!.id;

  const itemData = [
    { name: "2-Person Backpacking Tent", slug: "2p-tent", cat: "Tents & Shelter", price: 1800, deposit: 10000, qty: 6, img: "https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&q=70", desc: "Ultralight 3-season tent with footprint. Packs to 2 kg." },
    { name: "4-Person Family Tent", slug: "4p-tent", cat: "Tents & Shelter", price: 2500, deposit: 15000, qty: 4, img: "https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=800&q=70", desc: "Roomy car-camping tent with vestibule. Sets up in 10 minutes." },
    { name: "Sleeping Bag (20°F)", slug: "sleeping-bag", cat: "Tents & Shelter", price: 900, deposit: 5000, qty: 12, img: "https://images.unsplash.com/photo-1520095972714-909e91b038e5?w=800&q=70", desc: "Down mummy bag, freshly laundered. Includes compression sack." },
    { name: "65L Backpack", slug: "65l-pack", cat: "Backpacks", price: 1200, deposit: 8000, qty: 8, img: "https://images.unsplash.com/photo-1553731472-f1e1b8a16a5f?w=800&q=70", desc: "Adjustable torso, rain cover included. Sizes S–L." },
    { name: "Daypack 28L", slug: "daypack", cat: "Backpacks", price: 600, deposit: 3000, qty: 10, img: "https://images.unsplash.com/photo-1622260614153-03223fb72052?w=800&q=70", desc: "Perfect for summit days. Hydration compatible." },
    { name: "Camp Stove Kit", slug: "stove-kit", cat: "Cooking", price: 800, deposit: 4000, qty: 7, img: "https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?w=800&q=70", desc: "Two-burner stove, fuel canister, pot set and utensils." },
    { name: "Bear Canister", slug: "bear-canister", cat: "Cooking", price: 500, deposit: 5000, qty: 9, img: "https://images.unsplash.com/photo-1533240332313-0db49b459ad6?w=800&q=70", desc: "Required in RMNP backcountry. 11.5 L." },
    { name: "Inflatable Paddleboard", slug: "sup", cat: "Water", price: 3500, deposit: 20000, qty: 3, img: "https://images.unsplash.com/photo-1526188717906-ab4a2f949f0f?w=800&q=70", desc: "10'6\" all-round board with pump, paddle, leash and PFD.", minDays: 1 },
  ];
  const items: Record<string, string> = {};
  for (const it of itemData) {
    const created = await prisma.item.create({
      data: {
        businessId: business.id,
        categoryId: cat(it.cat),
        name: it.name,
        slug: it.slug,
        sku: it.slug.toUpperCase(),
        description: it.desc,
        imageUrl: it.img,
        pricePerDay: it.price,
        deposit: it.deposit,
        quantity: it.qty,
        minDays: it.minDays ?? 1,
      },
    });
    items[it.slug] = created.id;
  }

  const customers = await Promise.all(
    [
      { name: "Maya Chen", email: "maya@example.com", phone: "+1 720 555 0101" },
      { name: "Diego Alvarez", email: "diego@example.com", phone: "+1 303 555 0177" },
      { name: "Priya Nair", email: "priya@example.com", phone: "" },
      { name: "Sam Okafor", email: "sam@example.com", phone: "+1 720 555 0199" },
    ].map((c) => prisma.customer.create({ data: { ...c, businessId: business.id } })),
  );

  type Line = { slug: string; qty: number };
  async function order(n: number, customerIdx: number, status: string, start: number, end: number, lines: Line[], pay: "full" | "none" | "partial", source = "storefront") {
    const days = end - start + 1;
    const orderLines = lines.map((l) => {
      const it = itemData.find((i) => i.slug === l.slug)!;
      return { itemId: items[l.slug], quantity: l.qty, unitPrice: it.price, days, lineTotal: it.price * days * l.qty, deposit: it.deposit * l.qty };
    });
    const subtotal = orderLines.reduce((s, l) => s + l.lineTotal, 0);
    const deposit = orderLines.reduce((s, l) => s + l.deposit, 0);
    const tax = Math.round((subtotal * business.taxRate) / 100);
    const total = subtotal + tax + deposit;
    const o = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customers[customerIdx].id,
        orderNumber: n,
        status,
        startDate: day(start),
        endDate: day(end),
        subtotal,
        deposit,
        tax,
        total,
        source,
        items: { create: orderLines.map(({ deposit: _d, ...l }) => l) },
      },
    });
    if (pay !== "none") {
      const amount = pay === "full" ? total : Math.round(total / 2);
      await prisma.payment.create({
        data: { businessId: business.id, orderId: o.id, amount, currency: "USD", method: pay === "full" ? "simulated" : "cash", status: "paid", paidAt: day(start - 3) },
      });
    }
    return o;
  }

  await order(1001, 0, "RETURNED", -20, -17, [{ slug: "2p-tent", qty: 1 }, { slug: "sleeping-bag", qty: 2 }], "full");
  await order(1002, 1, "RETURNED", -12, -10, [{ slug: "sup", qty: 2 }], "full");
  await order(1003, 2, "ACTIVE", -4, -1, [{ slug: "4p-tent", qty: 1 }, { slug: "stove-kit", qty: 1 }], "full"); // overdue
  await order(1004, 3, "ACTIVE", -2, 1, [{ slug: "65l-pack", qty: 2 }, { slug: "bear-canister", qty: 2 }], "full"); // due tomorrow
  await order(1005, 0, "CONFIRMED", 1, 3, [{ slug: "sup", qty: 1 }], "full"); // pickup tomorrow
  await order(1006, 1, "CONFIRMED", 2, 6, [{ slug: "2p-tent", qty: 2 }, { slug: "sleeping-bag", qty: 4 }, { slug: "stove-kit", qty: 1 }], "partial", "manual");
  await order(1007, 2, "PENDING", 5, 7, [{ slug: "daypack", qty: 3 }], "none", "bot");
  await order(1008, 3, "CANCELLED", 8, 9, [{ slug: "4p-tent", qty: 1 }], "none");

  const convo = await prisma.conversation.create({
    data: { businessId: business.id, visitorId: "seedvisitor1", customerId: customers[2].id },
  });
  await prisma.message.createMany({
    data: [
      { conversationId: convo.id, role: "user", content: "Do you have 3 daypacks free next weekend?" },
      { conversationId: convo.id, role: "assistant", content: "Yes! We have 10 daypacks and 3 are free for those dates at $6/day each. Want me to reserve them?" },
      { conversationId: convo.id, role: "user", content: "Yes please, Priya Nair, priya@example.com" },
      { conversationId: convo.id, role: "assistant", content: "Done – reservation #1007 is pending. You'll get a payment link to confirm." },
    ],
  });

  console.log("Seeded demo business 'Peak Gear Rentals' (login demo@rentflow.app / demo1234).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
