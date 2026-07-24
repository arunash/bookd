/**
 * Card on file — encrypted PAN / exp / CVV / billing zip / holder name.
 *
 * The voice agent can read the card to a receptionist when a deposit / copay
 * is requested on the call. Plaintext brand + last4 are kept for UI display
 * only; everything sensitive is AES-256-GCM via lib/crypto.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptForUser } from "@/lib/crypto";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  holderName: z.string().min(1).max(80),
  number: z.string().regex(/^\d{13,19}$/, "must be 13–19 digits, no spaces"),
  exp: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "MM/YY"),
  cvv: z.string().regex(/^\d{3,4}$/),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "5 or 9 digit US zip"),
});

function detectBrand(pan: string): string {
  if (/^4/.test(pan)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(pan)) return "Mastercard";
  if (/^3[47]/.test(pan)) return "Amex";
  if (/^(6011|65|64[4-9])/.test(pan)) return "Discover";
  return "Card";
}

function uint8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as unknown as Uint8Array;
}

export async function POST(req: NextRequest) {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  const pan = d.number.replace(/\D/g, "");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      cardBrand: detectBrand(pan),
      cardLast4: pan.slice(-4),
      cardHolderNameEnc: uint8(encryptForUser(user.id, d.holderName.trim())) as Uint8Array,
      cardNumberEnc:     uint8(encryptForUser(user.id, pan)) as Uint8Array,
      cardExpEnc:        uint8(encryptForUser(user.id, d.exp)) as Uint8Array,
      cardCvvEnc:        uint8(encryptForUser(user.id, d.cvv)) as Uint8Array,
      cardZipEnc:        uint8(encryptForUser(user.id, d.zip)) as Uint8Array,
    } as Parameters<typeof prisma.user.update>[0]["data"],
  });

  return NextResponse.json({ ok: true, brand: detectBrand(pan), last4: pan.slice(-4) });
}

export async function DELETE() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      cardBrand: null, cardLast4: null,
      cardHolderNameEnc: null, cardNumberEnc: null, cardExpEnc: null, cardCvvEnc: null, cardZipEnc: null,
    } as Parameters<typeof prisma.user.update>[0]["data"],
  });
  return NextResponse.json({ ok: true });
}
