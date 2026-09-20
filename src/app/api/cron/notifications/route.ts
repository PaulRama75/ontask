import { getCurrentUser } from "@/lib/auth";
import { runScheduledNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Manual trigger for the scheduled emails (weekly expiry digest, anniversaries).
// Allowed for a Super Admin session or a bearer CRON_SECRET.
//   ?force=1          skip the time-of-day gate and de-duplication
//   ?date=YYYY-MM-DD  pretend today is that date (for testing)
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization");
  const okSecret = !!secret && bearer === `Bearer ${secret}`;
  if (!okSecret) {
    const me = await getCurrentUser();
    if (!me || me.role !== "SUPER_ADMIN") return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const date = url.searchParams.get("date");
  const now = date ? new Date(`${date}T15:00:00Z`) : undefined;
  if (now && Number.isNaN(now.getTime())) return new Response("Bad date", { status: 400 });

  const result = await runScheduledNotifications({ now, force });
  return Response.json(result);
}
