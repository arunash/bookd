/**
 * Mark a BookingRequest as cancelled.
 *
 * Used by the home-page "close out" action for stuck/queued/failed requests
 * the user has resolved manually (or wants out of the active list).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const existing = await prisma.bookingRequest.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status === "booked") {
    return NextResponse.json({ error: "already booked — use Bookings page to cancel" }, { status: 400 });
  }

  await prisma.bookingRequest.update({
    where: { id },
    data: { status: "cancelled", updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
