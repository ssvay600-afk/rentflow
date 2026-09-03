/**
 * Run the reminder agent once from the command line:
 *   npm run agent:run
 * Useful for crontab / CI schedulers that can't hit the HTTP endpoint.
 */
try {
  process.loadEnvFile?.(".env");
} catch {}

async function main() {
  const { runReminderAgentForAll } = await import("../src/lib/reminders");
  const { prisma } = await import("../src/lib/db");
  const results = await runReminderAgentForAll("cron");
  for (const r of results) {
    console.log(`\n${r.business}`);
    console.log(`  ${r.result.summary}`);
    for (const e of r.result.errors) console.log(`  ! ${e}`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
