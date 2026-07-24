/**
 * Confirm a chat-flow draft and place the call.
 *
 * Persists the draft as a BookingRequest, then hands off to placeBookingCall.
 * Returns requestId so the UI can navigate to /bookings/[id] and poll Vapi.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { placeBookingCall } from "@/lib/booking-orchestrator";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  personId: z.string().min(1),
  providerId: z.string().min(1),
  serviceTypeHint: z.enum(["pt", "ot", "speech", "doctor", "dentist", "therapist", "salon", "restaurant", "other"]).optional(),
  requestSummary: z.string().min(1),
  desiredWindowSummary: z.string().min(1),
  earliestStartIso: z.string().optional(),
  latestStartIso: z.string().optional(),
  preferredDow: z.array(z.string()).optional(),
  preferredHourMin: z.number().int().min(0).max(23).optional(),
  preferredHourMax: z.number().int().min(0).max(23).optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad draft", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  // Sanity: person + provider belong to this user
  const [person, provider] = await Promise.all([
    prisma.person.findFirst({ where: { id: d.personId, userId: user.id } }),
    prisma.provider.findFirst({ where: { id: d.providerId, userId: user.id, active: true } }),
  ]);
  if (!person) return NextResponse.json({ error: "personId not found" }, { status: 404 });
  if (!provider) return NextResponse.json({ error: "providerId not found" }, { status: 404 });
  if (provider.policy === "online_only") {
    return NextResponse.json({ error: `${provider.name} is online_only — no phone bookings` }, { status: 400 });
  }

  // Build rawRequest text from the summary for traceability
  const rawRequest = `${d.requestSummary}\n\nWindow: ${d.desiredWindowSummary}${d.notes ? `\n\nNotes: ${d.notes}` : ""}`;

  const request = await prisma.bookingRequest.create({
    data: {
      userId: user.id,
      personId: d.personId,
      providerId: d.providerId,
      serviceTypeHint: d.serviceTypeHint ?? provider.serviceType,
      rawRequest,
      parsedSummary: d.requestSummary,
      earliestStart: d.earliestStartIso ? new Date(d.earliestStartIso) : null,
      latestStart: d.latestStartIso ? new Date(d.latestStartIso) : null,
      preferredDow: d.preferredDow ?? [],
      preferredHourMin: d.preferredHourMin ?? null,
      preferredHourMax: d.preferredHourMax ?? null,
      notes: d.notes ?? null,
      status: "queued",
    },
  });

  try {
    const result = await placeBookingCall(request.id, {
      webhookBaseUrl: process.env.PUBLIC_BASE_URL,
    });
    return NextResponse.json({ ok: true, requestId: request.id, callId: result.callId, vapiCallId: result.vapiCallId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.bookingRequest.update({
      where: { id: request.id },
      data: { status: "failed", notes: `place_failed: ${msg.slice(0, 400)}` },
    });
    return NextResponse.json({ ok: false, requestId: request.id, error: msg }, { status: 500 });
  }
}
