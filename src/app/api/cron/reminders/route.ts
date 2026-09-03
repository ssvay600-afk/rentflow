import { NextResponse } from "next/server";
import { runReminderAgentForAll } from "@/lib/reminders";

export const maxDuration = 300;

/**
 * Trigger the reminder agent for every business. Call from an external
 * scheduler (Vercel Cron, GitHub Actions, crontab) with the CRON_SECRET:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/reminders
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");
  if (secret && provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results = await runReminderAgentForAll("cron");
  return NextResponse.json({
    ranAt: new Date().toISOString(),
    businesses: results.map((r) => ({ business: r.business, ...r.result })),
  });
}

export const GET = handle;
export const POST = handle;
