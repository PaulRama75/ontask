import { runScheduledNotifications } from "./notifications";

const HOUR_MS = 60 * 60 * 1000;

// In-process hourly tick. Safe with several app instances: each notification
// is claimed through a unique DB key before it is sent, so only one instance
// ever sends it.
export function startScheduler(): void {
  const g = globalThis as unknown as { __ferSchedulerStarted?: boolean };
  if (g.__ferSchedulerStarted) return;
  g.__ferSchedulerStarted = true;

  const tick = () => {
    runScheduledNotifications().catch((err) => console.error("[scheduler] run failed", err));
  };
  setTimeout(tick, 60 * 1000);
  setInterval(tick, HOUR_MS);
}
