/**
 * One-time Stripe setup for a RentFlow install.
 *
 *   npm run stripe:setup                      # products, prices, billing portal config
 *   npm run stripe:setup -- --webhooks https://your-app.vercel.app
 *
 * Idempotent: re-running finds existing products by metadata. Webhook signing
 * secrets are only shown once by Stripe, so they're printed here for you to
 * store in your host's environment variables.
 */
import Stripe from "stripe";
import fs from "node:fs";

try {
  process.loadEnvFile?.(".env");
} catch {}

const PLANS = [
  { key: "starter", name: "RentFlow Starter", amount: 2900, description: "Storefront, orders, inventory and card payments for one location." },
  { key: "pro", name: "RentFlow Pro", amount: 7900, description: "Everything in Starter plus the AI support bot and AI-written reminders." },
];

const PLATFORM_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
];

const CONNECT_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "account.updated",
];

function writeEnv(updates: Record<string, string>) {
  if (!fs.existsSync(".env")) return;
  let text = fs.readFileSync(".env", "utf8");
  for (const [k, v] of Object.entries(updates)) {
    const line = `${k}="${v}"`;
    text = new RegExp(`^${k}=`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(".env", text);
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set (see .env.example)");
  if (key.includes("_live_")) console.warn("! Using a LIVE key. Objects created here are real.");
  const stripe = new Stripe(key, { appInfo: { name: "RentFlow setup" } });

  const args = process.argv.slice(2);
  const webhooksBase = args.includes("--webhooks") ? args[args.indexOf("--webhooks") + 1]?.replace(/\/$/, "") : null;

  // --- Products & prices ------------------------------------------------
  const priceIds: Record<string, string> = {};
  for (const plan of PLANS) {
    const existing = await stripe.products.search({ query: `metadata["rentflow_plan"]:"${plan.key}" AND active:"true"` });
    let product = existing.data[0];
    if (!product) {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { rentflow_plan: plan.key },
      });
      console.log(`created product ${product.id} (${plan.name})`);
    }
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
    let price = prices.data.find((p) => p.recurring?.interval === "month" && p.unit_amount === plan.amount && p.currency === "usd");
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: plan.amount,
        recurring: { interval: "month" },
        metadata: { rentflow_plan: plan.key },
      });
      console.log(`created price ${price.id} ($${plan.amount / 100}/mo)`);
    }
    priceIds[plan.key] = price.id;
  }

  // --- Customer portal configuration --------------------------------------
  const configs = await stripe.billingPortal.configurations.list({ limit: 10 });
  const hasPortal = configs.data.some((c) => c.metadata?.rentflow === "1");
  if (!hasPortal) {
    const products = await Promise.all(
      PLANS.map(async (plan) => {
        const price = await stripe.prices.retrieve(priceIds[plan.key]);
        return { product: typeof price.product === "string" ? price.product : price.product.id, prices: [price.id] };
      }),
    );
    await stripe.billingPortal.configurations.create({
      business_profile: { headline: "Manage your RentFlow subscription" },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        subscription_update: { enabled: true, default_allowed_updates: ["price"], products, proration_behavior: "create_prorations" },
      },
      default_return_url: `${process.env.APP_URL ?? "http://localhost:3000"}/billing`,
      metadata: { rentflow: "1" },
    });
    console.log("created billing portal configuration");
  }

  // --- Webhook endpoints --------------------------------------------------
  const secrets: Record<string, string> = {};
  if (webhooksBase) {
    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    const ensure = async (path: string, events: Stripe.WebhookEndpointCreateParams.EnabledEvent[], connect: boolean, envKey: string) => {
      const url = `${webhooksBase}${path}`;
      const found = existing.data.find((e) => e.url === url);
      if (found) {
        console.log(`webhook already exists for ${url} (${found.id}); rotate it in the Dashboard to get a new secret`);
        return;
      }
      const ep = await stripe.webhookEndpoints.create({ url, enabled_events: events, connect, description: `RentFlow ${connect ? "connect" : "platform"}` });
      console.log(`created webhook ${ep.id} → ${url}`);
      if (ep.secret) secrets[envKey] = ep.secret;
    };
    await ensure("/api/webhooks/stripe", PLATFORM_EVENTS, false, "STRIPE_WEBHOOK_SECRET");
    await ensure("/api/webhooks/stripe/connect", CONNECT_EVENTS, true, "STRIPE_CONNECT_WEBHOOK_SECRET");
  }

  // --- Output -------------------------------------------------------------
  const env: Record<string, string> = {
    STRIPE_PRICE_STARTER: priceIds.starter,
    STRIPE_PRICE_PRO: priceIds.pro,
    ...secrets,
  };
  console.log("\nAdd these to your environment (Vercel → Settings → Environment Variables, mark secrets as Sensitive):\n");
  for (const [k, v] of Object.entries(env)) console.log(`${k}=${k.includes("SECRET") ? v : v}`);
  if (args.includes("--write-env")) {
    writeEnv(env);
    console.log("\n.env updated.");
  }
  if (!webhooksBase) {
    console.log("\nFor local testing run:\n  stripe listen --forward-to localhost:3000/api/webhooks/stripe --forward-connect-to localhost:3000/api/webhooks/stripe/connect\nand put the printed whsec_ value in STRIPE_WEBHOOK_SECRET.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
