/**
 * Booking orchestrator — turns a BookingRequest into a placed call.
 *
 * Flow:
 *   1. Load BookingRequest + Person + Provider + (optional) InsuranceProfile
 *   2. Decrypt patient name / DOB / insurance member ID
 *   3. Build the CallContext for the Vapi assistant prompt
 *   4. Create a Call row (so the webhook can find it on the first event)
 *   5. Call Vapi.placeCall
 *   6. Patch the Call row with vapiCallId
 *   7. Mark BookingRequest in_progress, increment attempts
 */
import { prisma } from "./db";
import { decryptForUser } from "./crypto";
import { placeCall, type CallContext } from "./vapi";

function uint8ToString(buf: Uint8Array | null): string | null {
  return buf ? Buffer.from(buf).toString("utf8") : null;
}

export async function placeBookingCall(requestId: string, opts?: { webhookBaseUrl?: string }): Promise<{ callId: string; vapiCallId: string }> {
  const req = await prisma.bookingRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      person: true,
      provider: true,
      user: true,
    },
  });

  if (!req.provider) throw new Error("BookingRequest has no provider set");
  if (req.provider.policy === "online_only") {
    throw new Error(`Provider ${req.provider.name} is online-only — don't call`);
  }

  // Decrypt patient PII
  const firstName = req.person.firstNameEnc
    ? decryptForUser(req.user.id, new Uint8Array(req.person.firstNameEnc))
    : null;
  if (!firstName) throw new Error("Could not decrypt patient firstName");
  const dob = req.person.dobEnc
    ? decryptForUser(req.user.id, new Uint8Array(req.person.dobEnc))
    : undefined;

  // Pull primary insurance for this person (if it's a medical service)
  let insurance: CallContext["insurance"] | undefined;
  const isMedical = ["pt", "ot", "speech", "doctor", "dentist", "therapist"].includes(req.provider.serviceType);
  if (isMedical) {
    const ins = await prisma.insuranceProfile.findFirst({
      where: { personId: req.person.id, primary: true },
    });
    if (ins) {
      const memberId = decryptForUser(req.user.id, new Uint8Array(ins.memberIdEnc));
      const groupId = ins.groupIdEnc ? decryptForUser(req.user.id, new Uint8Array(ins.groupIdEnc)) : undefined;
      insurance = {
        carrier: ins.carrier,
        memberId: memberId ?? "",
        groupId: groupId ?? undefined,
        planName: ins.planName ?? undefined,
        network: ins.network ?? undefined,
      };
    }
  }

  // Card on file — always passed when present. The system prompt enforces that
  // the agent only reads it out if the receptionist asks (deposit / copay).
  let paymentCard: CallContext["paymentCard"] | undefined;
  if (req.user.cardNumberEnc && req.user.cardLast4 && req.user.cardBrand) {
    const number = decryptForUser(req.user.id, new Uint8Array(req.user.cardNumberEnc));
    const exp    = req.user.cardExpEnc ? decryptForUser(req.user.id, new Uint8Array(req.user.cardExpEnc)) : null;
    const cvv    = req.user.cardCvvEnc ? decryptForUser(req.user.id, new Uint8Array(req.user.cardCvvEnc)) : null;
    const zip    = req.user.cardZipEnc ? decryptForUser(req.user.id, new Uint8Array(req.user.cardZipEnc)) : null;
    const holder = req.user.cardHolderNameEnc ? decryptForUser(req.user.id, new Uint8Array(req.user.cardHolderNameEnc)) : null;
    if (number && exp && cvv && zip && holder) {
      paymentCard = { brand: req.user.cardBrand, last4: req.user.cardLast4, holderName: holder, number, exp, cvv, zip };
    }
  }

  // Build human-readable window string
  const windowSummary = buildWindowSummary({ ...req, preferredDow: ((req.preferredDow as string[] | null) ?? []) });

  const ctx: CallContext = {
    serviceType: serviceTypeLabel(req.provider.serviceType),
    providerName: req.provider.name,
    patientFirstName: firstName,
    patientRelationship: req.person.relationship,
    patientDob: dob ?? undefined,
    bookerName: req.user.name ?? undefined,
    bookerCallback: process.env.USER_CELL_PHONE ?? "",
    desiredWindow: windowSummary,
    insurance,
    paymentCard,
    additionalContext: req.notes ?? req.parsedSummary ?? undefined,
  };

  // Pre-create the Call row so the webhook can find it on the first event
  const callRow = await prisma.call.create({
    data: {
      userId: req.user.id,
      providerId: req.provider.id,
      requestId: req.id,
    },
  });

  // `.trim()` because Vercel env-var inputs occasionally carry a trailing
  // newline (echo vs printf), which Vapi rejects as an invalid URL.
  const baseUrl = (opts?.webhookBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3003").trim();
  const webhookSecret = (process.env.VAPI_WEBHOOK_SECRET ?? process.env.CRON_SECRET ?? "").trim();

  const result = await placeCall({
    providerPhone: req.provider.phone,
    providerName: req.provider.name,
    context: ctx,
    webhookUrl: `${baseUrl}/api/webhooks/vapi`,
    webhookSecret,
  });

  await prisma.call.update({
    where: { id: callRow.id },
    data: { vapiCallId: result.id, startedAt: new Date() },
  });

  await prisma.bookingRequest.update({
    where: { id: req.id },
    data: { status: "in_progress", attempts: { increment: 1 } },
  });

  return { callId: callRow.id, vapiCallId: result.id };
}

function buildWindowSummary(req: { earliestStart: Date | null; latestStart: Date | null; preferredDow: string[]; preferredHourMin: number | null; preferredHourMax: number | null }): string {
  const parts: string[] = [];
  if (req.earliestStart && req.latestStart) {
    parts.push(`between ${req.earliestStart.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} and ${req.latestStart.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`);
  } else if (req.earliestStart) {
    parts.push(`on or after ${req.earliestStart.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`);
  }
  if (req.preferredDow.length) {
    parts.push(`prefer ${req.preferredDow.join(" or ").toUpperCase()}`);
  }
  if (req.preferredHourMin != null && req.preferredHourMax != null) {
    parts.push(`between ${fmtHour(req.preferredHourMin)} and ${fmtHour(req.preferredHourMax)}`);
  }
  return parts.length ? parts.join(", ") : "as soon as possible";
}

function fmtHour(h: number): string {
  const isPm = h >= 12;
  const display = ((h + 11) % 12) + 1;
  return `${display} ${isPm ? "PM" : "AM"}`;
}

function serviceTypeLabel(t: string): string {
  return {
    pt: "physical therapy",
    ot: "occupational therapy",
    speech: "speech therapy",
    doctor: "doctor",
    dentist: "dentist",
    therapist: "therapy",
    salon: "salon appointment",
    restaurant: "table reservation",
    other: "appointment",
  }[t] ?? "appointment";
}
