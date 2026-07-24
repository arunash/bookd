import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptForUser } from "@/lib/crypto";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  relationship: z.enum(["self", "daughter", "son", "spouse", "parent", "other"]),
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().optional(),

  // Insurance (optional)
  insurance: z.object({
    carrier: z.string().min(1).max(120),
    planName: z.string().max(120).optional(),
    network: z.string().max(40).optional(),
    memberId: z.string().min(1).max(80),
    groupId: z.string().max(80).optional(),
    pcpName: z.string().max(120).optional(),
    notes: z.string().optional(),
  }).optional(),
});

// Prisma's Bytes column expects Uint8Array<ArrayBuffer>; Node Buffer narrows to
// Uint8Array<ArrayBufferLike> in strict mode. Identical bytes at runtime —
// cast through unknown to satisfy the stricter type.
function uint8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as unknown as Uint8Array;
}

export async function POST(req: NextRequest) {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        userId: user.id,
        relationship: d.relationship,
        firstNameEnc: uint8(encryptForUser(user.id, d.firstName.trim())) as Uint8Array,
        lastNameEnc: d.lastName ? (uint8(encryptForUser(user.id, d.lastName.trim())) as Uint8Array) : null,
        dobEnc: d.dob ? (uint8(encryptForUser(user.id, d.dob)) as Uint8Array) : null,
        notes: d.notes?.trim() || null,
      } as Parameters<typeof tx.person.create>[0]["data"],
    });

    if (d.insurance) {
      const i = d.insurance;
      await tx.insuranceProfile.create({
        data: {
          userId: user.id,
          personId: person.id,
          carrier: i.carrier.trim(),
          planName: i.planName?.trim() || null,
          network: i.network?.trim() || null,
          memberIdEnc: uint8(encryptForUser(user.id, i.memberId.trim())) as Uint8Array,
          groupIdEnc: i.groupId ? (uint8(encryptForUser(user.id, i.groupId.trim())) as Uint8Array) : null,
          pcpName: i.pcpName?.trim() || null,
          notes: i.notes?.trim() || null,
          primary: true,
        } as Parameters<typeof tx.insuranceProfile.create>[0]["data"],
      });
    }
    return { id: person.id };
  });

  return NextResponse.json({ ok: true, id: result.id });
}
