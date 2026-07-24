/**
 * Manually place another call attempt for an existing BookingRequest.
 *
 * Powers the "Try again" button on /bookings/[id]. Unlike the cron decider,
 * this actually dials — it hands off to placeBookingCall, which creates a fresh
 * Call row, fires Vapi, and flips the request back to in_progress.
 *
 * Guards: request must belong to the user, must not already be booked, and must
 * not have a call currently in flight (so the button can't double-dial).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { placeBookingCall } from "@/lib/booking-orchestrator";
import { MIN_MINUTES_BETWEEN, isBusinessHoursPT } from "@/lib/business-hours";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const existing = await prisma.bookingRequest.findFirst({
    where: { id, userId: user.id },
    include: { calls: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status === "booked") {
    return NextResponse.json({ error: "already booked" }, { status: 400 });
  }
  const last = existing.calls[0];
  if (existing.status === "in_progress" || (last && !last.endedAt)) {
    return NextResponse.json({ error: "a call is already in flight" }, { status: 409 });
  }
  if (!isBusinessHoursPT()) {
    return NextResponse.json({ error: "outside business hours (9–5 PT, Mon–Fri)" }, { status: 409 });
  }
  if (last?.createdAt) {
    const minutesSince = (Date.now() - last.createdAt.getTime()) / 60000;
    if (minutesSince < MIN_MINUTES_BETWEEN) {
      const wait = Math.ceil(MIN_MINUTES_BETWEEN - minutesSince);
      return NextResponse.json({ error: `last attempt was ${Math.round(minutesSince)}m ago — wait ${wait}m before retrying` }, { status: 409 });
    }
  }

  try {
    const result = await placeBookingCall(id, { webhookBaseUrl: process.env.PUBLIC_BASE_URL });
    return NextResponse.json({ ok: true, requestId: id, vapiCallId: result.vapiCallId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.bookingRequest.update({
      where: { id },
      data: { status: "failed", notes: `retry_failed: ${msg.slice(0, 400)}` },
    });
    return NextResponse.json({ ok: false, requestId: id, error: msg }, { status: 500 });
  }
}
