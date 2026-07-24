/**
 * Edit a BookingRequest's details (what's being asked, who/where, time window).
 * Blocked once the request is booked — editing a confirmed slot's details would
 * desync the created Booking / calendar event.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const Schema = z.object({
  personId: z.string().min(1),
  providerId: z.string().min(1).nullable().optional(),
  requestSummary: z.string().min(1).max(2000),
  notes: z.string().max(2000).optional(),
  earliestStartIso: z.string().optional().or(z.literal("")),
  latestStartIso: z.string().optional().or(z.literal("")),
  preferredDow: z.array(z.enum(DOW)).optional(),
  preferredHourMin: z.number().int().min(0).max(23).nullable().optional(),
  preferredHourMax: z.number().int().min(0).max(23).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const existing = await prisma.bookingRequest.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status === "booked") {
    return NextResponse.json({ error: "already booked — can't edit a confirmed request" }, { status: 400 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  // Validate ownership of person + provider.
  const person = await prisma.person.findFirst({ where: { id: d.personId, userId: user.id } });
  if (!person) return NextResponse.json({ error: "personId not found" }, { status: 404 });
  if (d.providerId) {
    const provider = await prisma.provider.findFirst({ where: { id: d.providerId, userId: user.id } });
    if (!provider) return NextResponse.json({ error: "providerId not found" }, { status: 404 });
  }

  const summary = d.requestSummary.trim();
  const rawRequest = d.notes?.trim() ? `${summary}\n\nNotes: ${d.notes.trim()}` : summary;

  await prisma.bookingRequest.update({
    where: { id },
    data: {
      personId: d.personId,
      providerId: d.providerId ?? null,
      rawRequest,
      parsedSummary: summary,
      notes: d.notes?.trim() || null,
      earliestStart: d.earliestStartIso ? new Date(d.earliestStartIso) : null,
      latestStart: d.latestStartIso ? new Date(d.latestStartIso) : null,
      preferredDow: d.preferredDow ?? [],
      preferredHourMin: d.preferredHourMin ?? null,
      preferredHourMax: d.preferredHourMax ?? null,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, id });
}
