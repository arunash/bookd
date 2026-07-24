/**
 * Vapi webhook — receives lifecycle events for outbound calls.
 *
 * Events we care about:
 *   - status-update: call.status changes (queued → in-progress → ended)
 *   - transcript: streaming transcripts of both sides
 *   - end-of-call-report: final transcript + outcome + recording URL
 *   - transfer-destination-request / transfer-update: patch-through events
 *
 * Auth: serverUrlSecret on the Assistant config — Vapi includes it as
 *       `x-vapi-secret` header (or in payload). We verify before processing.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptForUser } from "@/lib/crypto";
import { getCall } from "@/lib/vapi";
import { classifyCall, type CallOutcome } from "@/lib/call-classifier";

export const dynamic = "force-dynamic";

// The classifier can emit outcomes the Prisma `CallOutcome` enum doesn't have
// (`not_accepting_patients`, `needs_retry`). Writing one of those straight to
// the DB throws and the whole finalize aborts — the call stays "unknown" and the
// request stays stuck In-flight. Coerce to a valid enum value here; the precise
// nuance is preserved in `outcomeDetail` (the human summary). `not_accepting_patients`
// maps to `hung_up` (call ended, no booking) rather than `refused_by_provider` so it
// does NOT incorrectly flip the provider's policy to human_required.
const PRISMA_OUTCOME: Record<CallOutcome, string> = {
  booked: "booked",
  patched_then_booked: "patched_then_booked",
  voicemail_left: "voicemail_left",
  voicemail_no_message: "voicemail_no_message",
  no_answer: "no_answer",
  busy: "busy",
  refused_by_provider: "refused_by_provider",
  not_accepting_patients: "hung_up",
  hung_up: "hung_up",
  error: "error",
  needs_retry: "unknown",
  unknown: "unknown",
};

type VapiPayload = {
  message: {
    type: string;
    // Vapi puts status / endedReason on the message envelope, NOT on message.call.
    status?: "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
    endedReason?: string;
    call?: { id: string };
    timestamp?: number;
    transcript?: string;
    role?: "user" | "assistant";
    artifact?: { recordingUrl?: string; transcript?: string };
    durationMs?: number;
    cost?: number;
  };
};

function verifySecret(req: NextRequest, body: unknown): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET ?? process.env.CRON_SECRET;
  if (!expected) return true; // dev — no secret configured
  const header = req.headers.get("x-vapi-secret");
  if (header === expected) return true;
  // Some Vapi setups put the secret inline
  const inline = (body as { secret?: string })?.secret;
  return inline === expected;
}

export async function POST(req: NextRequest) {
  let payload: VapiPayload;
  try { payload = (await req.json()) as VapiPayload; } catch { return new NextResponse("bad json", { status: 400 }); }
  if (!verifySecret(req, payload)) return new NextResponse("forbidden", { status: 403 });

  const msg = payload.message ?? ({} as VapiPayload["message"]);
  const vapiCallId = msg.call?.id;
  if (!vapiCallId) return NextResponse.json({ ok: true, reason: "no call.id in message" });

  const call = await prisma.call.findUnique({ where: { vapiCallId } });
  if (!call) {
    // The very first webhook may arrive before we've finished writing the Call
    // row. Stash an event in a dead-letter style by logging and returning OK.
    console.warn(`[vapi-webhook] unknown vapiCallId=${vapiCallId} type=${msg.type}`);
    return NextResponse.json({ ok: true, reason: "unknown call id; ignored" });
  }

  // Persist the raw event for audit
  await prisma.callEvent.create({
    data: { callId: call.id, type: msg.type ?? "unknown", payload: payload as unknown as object },
  });

  // Handle a few specific types
  switch (msg.type) {
    case "status-update": {
      if (msg.status === "in-progress" && !call.startedAt) {
        await prisma.call.update({ where: { id: call.id }, data: { startedAt: new Date() } });
      }
      // Vapi's `forwarding` status means the assistant is initiating a
      // transferCall — flag it as a patch even if Vapi never sends an
      // explicit transfer-update event.
      if (msg.status === "forwarding" && !call.patchedToUser) {
        await prisma.call.update({
          where: { id: call.id },
          data: { patchedToUser: true, patchAt: call.patchAt ?? new Date() },
        });
      }
      if (msg.status === "ended") {
        // Mark patch if Vapi tells us the call ended because the assistant
        // forwarded it but no `forwarding` status came through earlier.
        if (msg.endedReason === "assistant-forwarded-call" && !call.patchedToUser) {
          await prisma.call.update({
            where: { id: call.id },
            data: { patchedToUser: true, patchAt: call.patchAt ?? new Date() },
          });
        }
        await finalizeCall(call.id, vapiCallId);
      }
      break;
    }
    case "transfer-destination-request":
    case "transfer-update": {
      await prisma.call.update({
        where: { id: call.id },
        data: { patchedToUser: true, patchAt: call.patchAt ?? new Date() },
      });
      break;
    }
    case "end-of-call-report": {
      // Most authoritative event — has the final transcript + artifact.
      if (msg.endedReason === "assistant-forwarded-call" && !call.patchedToUser) {
        await prisma.call.update({
          where: { id: call.id },
          data: { patchedToUser: true, patchAt: call.patchAt ?? new Date() },
        });
      }
      await finalizeCall(call.id, vapiCallId);
      break;
    }
    // Streaming transcript chunks are stored in CallEvent (already done above).
  }

  return NextResponse.json({ ok: true });
}

/** Pull final call record from Vapi, encrypt transcript, classify outcome,
 *  write a Booking row if a slot was confirmed. Idempotent: re-running is safe.
 */
async function finalizeCall(callId: string, vapiCallId: string) {
  try {
    const c = await prisma.call.findUnique({ where: { id: callId } });
    if (!c) return;
    // Skip if already classified (idempotency for double-fired webhooks).
    if (c.outcome !== "unknown" && c.endedAt) return;

    const final = await getCall(vapiCallId);
    const transcript = final.transcript ?? "";

    // Claude classification — derives outcome + readable summary.
    const cls = await classifyCall(transcript, final.endedReason);
    const finalOutcome = c.patchedToUser && cls.outcome === "booked" ? "patched_then_booked" : cls.outcome;

    const updates: {
      endedAt: Date;
      durationSec?: number;
      costUsd?: number;
      recordingUrl?: string;
      transcriptEnc?: Uint8Array;
      outcome?: string;
      outcomeDetail?: string;
      voicemailLeft?: boolean;
      refusalDetected?: boolean;
    } = {
      endedAt: final.endedAt ? new Date(final.endedAt) : new Date(),
      outcome: PRISMA_OUTCOME[finalOutcome] ?? "unknown",
      outcomeDetail: cls.summary,
      voicemailLeft: finalOutcome === "voicemail_left",
      refusalDetected: finalOutcome === "refused_by_provider",
    };
    if (typeof final.cost === "number") updates.costUsd = final.cost;
    if (final.recordingUrl) updates.recordingUrl = final.recordingUrl;
    if (final.startedAt && final.endedAt) {
      updates.durationSec = Math.round((new Date(final.endedAt).getTime() - new Date(final.startedAt).getTime()) / 1000);
    }
    if (transcript) {
      updates.transcriptEnc = encryptForUser(c.userId, transcript) as unknown as Uint8Array;
    }

    await prisma.call.update({ where: { id: callId }, data: updates as Parameters<typeof prisma.call.update>[0]["data"] });

    // The call has ENDED — the request must never stay "in_progress" (In flight).
    // Booked with a parsed slot → write the Booking + mark booked. Booked but the
    // slot couldn't be parsed → needs_user_input. Anything else → failed (the user
    // can Try again or close it out; the summary explains what happened).
    const isBooked = finalOutcome === "booked" || finalOutcome === "patched_then_booked";
    if (isBooked && cls.confirmedSlotIso && c.requestId) {
      const slotStart = new Date(cls.confirmedSlotIso);
      const slotEnd = new Date(slotStart.getTime() + 45 * 60 * 1000); // 45-min default
      await prisma.booking.upsert({
        where: { requestId: c.requestId },
        create: {
          userId: c.userId,
          personId: (await prisma.bookingRequest.findUniqueOrThrow({ where: { id: c.requestId } })).personId,
          providerId: c.providerId!,
          requestId: c.requestId,
          scheduledStart: slotStart,
          scheduledEnd: slotEnd,
          confirmationNumber: cls.confirmationNumber ?? null,
          prepInstructions: cls.prepInstructions ?? null,
          outcome: finalOutcome === "patched_then_booked" ? "booked_by_user_via_patch" : "booked_by_agent",
        },
        update: {},
      });
      await prisma.bookingRequest.update({
        where: { id: c.requestId },
        data: { status: "booked", updatedAt: new Date() },
      });
    } else if (c.requestId) {
      await prisma.bookingRequest.update({
        where: { id: c.requestId },
        data: { status: isBooked ? "needs_user_input" : "failed", updatedAt: new Date() },
      });
    }

    // Independent of request status: a hard AI refusal teaches the provider policy.
    if (finalOutcome === "refused_by_provider" && c.providerId) {
      await prisma.provider.update({
        where: { id: c.providerId },
        data: { policy: "human_required", policyReason: cls.summary.slice(0, 200) },
      });
    }
  } catch (e) {
    console.error("[vapi-webhook] finalize failed:", (e as Error).message);
  }
}

// Vapi pings the URL on save to verify reachability
export async function GET() {
  return NextResponse.json({ ok: true, service: "booked-vapi-webhook" });
}
