export async function register() {
  // Only the Node.js server runtime, and only in production builds -- local
  // dev triggers the scheduled emails on demand via /api/cron/notifications.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
