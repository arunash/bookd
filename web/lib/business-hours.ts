/**
 * Shared call-window policy — used by the cron retry decider and the manual
 * "Try again" button so they agree on when a call may be placed.
 */

export const MAX_ATTEMPTS_PER_DAY = 16;     // every 30 min from 09:00 to 17:00 PT
export const MIN_MINUTES_BETWEEN = 25;
export const BUSINESS_OPEN_HOUR_PT = 9;
export const BUSINESS_CLOSE_HOUR_PT = 17;

export function nowInPT(): { hour: number; weekday: number } {
  // Pacific time (handles DST via Intl)
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false, weekday: "short" });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = parseInt(parts.hour ?? "0", 10);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, weekday: dayMap[parts.weekday as string] ?? 0 };
}

export function isBusinessHoursPT(t = nowInPT()): boolean {
  return t.hour >= BUSINESS_OPEN_HOUR_PT && t.hour < BUSINESS_CLOSE_HOUR_PT && t.weekday >= 1 && t.weekday <= 5;
}
