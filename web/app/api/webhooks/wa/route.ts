/**
 * WhatsApp inbound webhook for Booked.
 *
 * Shared number with Giftist: Booked only responds to messages starting with
 * "/book" or "book ". Anything else is ignored (Giftist's webhook handles it).
 *
 * Flow:
 *   inbound → isBookedMessage? → strip prefix → parse intent (Claude) →
 *   create/lookup Person + Provider → create BookingRequest →
 *   reply with confirmation → orchestrator places call (later phase)
 *
 * For Giftist to route prefixed messages here, add to Giftist's WA webhook:
 *
 *   if (msg.text.match(/^\/?book\b/i)) {
 *     await fetch("https://<booked>/api/webhooks/wa", { method:"POST", body: rawBody });
 *     return; // skip Giftist's own handling
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { constantTimeEqual } from "@/lib/secure";
import { parseInboundWebhook, sendWhatsAppText, isBookedMessage, stripBookPrefix } from "@/lib/wa";
import { parseBookingIntent } from "@/lib/intent-parser";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Meta verification handshake
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// Verify Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret).
// Fail-closed in production so nobody can inject fake inbound messages.
function verifyMetaSignature(req: NextRequest, raw: string): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return constantTimeEqual(header, expected);
}

export async function POST(req: NextRequest) {
  let raw: string;
  try { raw = await req.text(); } catch { return new NextResponse("bad json", { status: 400 }); }
  if (!verifyMetaSignature(req, raw)) return new NextResponse("forbidden", { status: 403 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new NextResponse("bad json", { status: 400 }); }

  const messages = parseInboundWebhook(body);
  for (const m of messages) {
    if (!isBookedMessage(m.text)) continue; // not for us — Giftist owns it

    try {
      const cleaned = stripBookPrefix(m.text);
      const user = await ensureBooker(m.fromPhone);
      const intent = await parseBookingIntent(cleaned, new Date().toISOString());

      if ("error" in intent) {
        await sendWhatsAppText(m.fromPhone, `Sorry, couldn't read that. Try: "book Eliza speech therapy with Dr Cohen next Tue or Thu 3-5pm"`);
        continue;
      }

      // Resolve Person + Provider
      const person = intent.patientName
        ? await prisma.person.findFirst({
            where: {
              userId: user.id,
              // we can't query encrypted fields directly — fall back to first person if no match
              // future improvement: store a non-PHI alias for lookup
            },
            orderBy: { createdAt: "desc" },
          })
        : await prisma.person.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

      const provider = intent.providerNameHint
        ? await prisma.provider.findFirst({
            where: {
              userId: user.id,
              active: true,
              OR: [
                { name: { contains: intent.providerNameHint } },
                ...(intent.serviceType ? [{ serviceType: intent.serviceType }] : []),
              ],
            },
          })
        : await prisma.provider.findFirst({
            where: {
              userId: user.id,
              active: true,
              ...(intent.serviceType ? { serviceType: intent.serviceType } : {}),
            },
            orderBy: { updatedAt: "desc" },
          });

      // Create the request even if we couldn't fully resolve — surface in UI for completion
      const r = await prisma.bookingRequest.create({
        data: {
          userId: user.id,
          personId: person?.id ?? (await firstPersonOrPlaceholder(user.id)),
          providerId: provider?.id ?? null,
          serviceTypeHint: intent.serviceType ?? null,
          rawRequest: m.text,
          parsedSummary: JSON.stringify(intent),
          earliestStart: intent.earliestStartIso ? new Date(intent.earliestStartIso) : null,
          latestStart: intent.latestStartIso ? new Date(intent.latestStartIso) : null,
          preferredDow: intent.preferredDow ?? [],
          preferredHourMin: intent.preferredHourMin ?? null,
          preferredHourMax: intent.preferredHourMax ?? null,
          notes: intent.notes ?? null,
          status: !provider || !person ? "needs_user_input" : "queued",
        },
      });

      // Reply
      const ackParts: string[] = [];
      ackParts.push(`Got it.`);
      if (provider) ackParts.push(`Calling ${provider.name}.`);
      else ackParts.push(`I don't know that provider yet — add them at /providers and I'll call.`);
      if (!person) ackParts.push(`I also don't know who to book for — set that up first.`);
      ackParts.push(`(request ${r.id.slice(0, 8)})`);
      await sendWhatsAppText(m.fromPhone, ackParts.join(" "));
    } catch (e) {
      console.error("[booked-wa] failed:", (e as Error).message);
      await sendWhatsAppText(m.fromPhone, `Hit a snag — ${(e as Error).message.slice(0, 120)}`);
    }
  }

  return NextResponse.json({ ok: true });
}

async function ensureBooker(phone: string): Promise<{ id: string }> {
  const norm = phone.replace(/^\+/, "");
  const existing = await prisma.user.findUnique({ where: { phone: norm } });
  if (existing) return { id: existing.id };
  return prisma.user.create({ data: { phone: norm, timezone: "America/Los_Angeles" } });
}

async function firstPersonOrPlaceholder(userId: string): Promise<string> {
  const p = await prisma.person.findFirst({ where: { userId } });
  if (p) return p.id;
  // Create a placeholder person — UI prompts user to fill in PII later
  const { encryptForUser } = await import("@/lib/crypto");
  const created = await prisma.person.create({
    data: {
      userId,
      relationship: "other",
      firstNameEnc: new Uint8Array(encryptForUser(userId, "Unknown")),
    },
  });
  return created.id;
}
