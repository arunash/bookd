/**
 * GET /api/cron/retries
 *
 * Walks every BookingRequest that's still "queued" or "in_progress" and
 * decides whether to:
 *  - place a new call attempt (no recent attempt, retry cap not hit, business
 *    hours, and time-window still valid),
 *  - skip (recent attempt, outside hours, or final-attempt cooldown),
 *  - mark failed (retry cap exhausted).
 *
 * This route is intended to be hit on a 30-minute cron — either via a
 * LaunchAgent locally or Vercel Cron in prod (see vercel.json).
 *
 * Auth: CRON_SECRET in Authorization header.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { placeBookingCall } from "@/lib/booking-orchestrator";
import { MAX_ATTEMPTS_PER_DAY, MIN_MINUTES_BETWEEN, BUSINESS_OPEN_HOUR_PT, BUSINESS_CLOSE_HOUR_PT, nowInPT } from "@/lib/business-hours";
import { constantTimeEqual } from "@/lib/secure";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // This endpoint PLACES CALLS — never leave it unauthenticated in production.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  } else {
    const auth = req.headers.get("authorization") ?? "";
    if (!constantTimeEqual(auth, `Bearer ${expected}`)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { hour, weekday } = nowInPT();
  const isBusinessHours = hour >= BUSINESS_OPEN_HOUR_PT && hour < BUSINESS_CLOSE_HOUR_PT && weekday >= 1 && weekday <= 5;
  const isFinalWindow = hour >= 16; // 16:30 and 17:00 attempts are allowed to leave a voicemail

  const requests = await prisma.bookingRequest.findMany({
    where: { status: { in: ["queued", "in_progress"] } },
    include: {
      calls: { orderBy: { createdAt: "desc" }, take: 1 },
      provider: { select: { id: true, name: true, phone: true } },
    },
  });

  const decisions: Array<{ id: string; action: string; reason?: string; vapiCallId?: string }> = [];

  for (const r of requests) {
    if (!r.provider) {
      decisions.push({ id: r.id, action: "skip", reason: "no provider" });
      continue;
    }
    if (r.attempts >= MAX_ATTEMPTS_PER_DAY) {
      await prisma.bookingRequest.update({ where: { id: r.id }, data: { status: "failed" } });
      decisions.push({ id: r.id, action: "fail", reason: `${r.attempts} attempts reached cap` });
      continue;
    }
    const last = r.calls[0];
    // Never double-dial: skip if the most recent call is still in flight (no endedAt).
    if (last && !last.endedAt) {
      decisions.push({ id: r.id, action: "skip", reason: "a call is already in flight" });
      continue;
    }
    if (last?.createdAt) {
      const minutesSince = (Date.now() - last.createdAt.getTime()) / 60000;
      if (minutesSince < MIN_MINUTES_BETWEEN) {
        decisions.push({ id: r.id, action: "skip", reason: `last attempt ${Math.round(minutesSince)}m ago` });
        continue;
      }
    }
    if (!isBusinessHours) {
      decisions.push({ id: r.id, action: "skip", reason: "outside business hours PT" });
      continue;
    }
    // Actually place the call through the SAME path as the "Try again" button:
    // placeBookingCall → lib/vapi.ts (the good, phone-tree-aware prompt). This
    // reuses all the trust/PHI/navigation behavior; the stale scripts/place_call.py
    // path is NOT used. attempts is incremented inside placeBookingCall, so the
    // cap check above eventually retires a request that never books.
    try {
      const result = await placeBookingCall(r.id, { webhookBaseUrl: process.env.PUBLIC_BASE_URL });
      decisions.push({ id: r.id, action: "dialed", reason: isFinalWindow ? "final window — voicemail allowed" : "normal retry", vapiCallId: result.vapiCallId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.bookingRequest.update({ where: { id: r.id }, data: { status: "failed", notes: `cron_retry_failed: ${msg.slice(0, 300)}` } });
      decisions.push({ id: r.id, action: "error", reason: msg.slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: true,
    nowPT: { hour, weekday, isBusinessHours, isFinalWindow },
    totalRequests: requests.length,
    decisions,
  });
}

export const POST = GET;
