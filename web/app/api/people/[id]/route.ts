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
  insurance: z.object({
    carrier: z.string().min(1).max(120),
    planName: z.string().max(120).optional(),
    network: z.string().max(40).optional(),
    memberId: z.string().min(1).max(80),
    groupId: z.string().max(80).optional(),
    pcpName: z.string().max(120).optional(),
    notes: z.string().optional(),
  }).nullable().optional(),
});

function uint8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as unknown as Uint8Array;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const existing = await prisma.person.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id },
      data: {
        relationship: d.relationship,
        firstNameEnc: uint8(encryptForUser(user.id, d.firstName.trim())) as Uint8Array,
        lastNameEnc: d.lastName ? (uint8(encryptForUser(user.id, d.lastName.trim())) as Uint8Array) : null,
        dobEnc: d.dob ? (uint8(encryptForUser(user.id, d.dob)) as Uint8Array) : null,
        notes: d.notes?.trim() || null,
        updatedAt: new Date(),
      } as Parameters<typeof tx.person.update>[0]["data"],
    });

    const primary = await tx.insuranceProfile.findFirst({ where: { personId: id, primary: true } });

    if (d.insurance === null) {
      // Box unchecked — remove the primary insurance if one existed.
      if (primary) await tx.insuranceProfile.delete({ where: { id: primary.id } });
      return;
    }
    if (d.insurance) {
      const i = d.insurance;
      const data = {
        carrier: i.carrier.trim(),
        planName: i.planName?.trim() || null,
        network: i.network?.trim() || null,
        memberIdEnc: uint8(encryptForUser(user.id, i.memberId.trim())) as Uint8Array,
        groupIdEnc: i.groupId ? (uint8(encryptForUser(user.id, i.groupId.trim())) as Uint8Array) : null,
        pcpName: i.pcpName?.trim() || null,
        notes: i.notes?.trim() || null,
      };
      if (primary) {
        await tx.insuranceProfile.update({ where: { id: primary.id }, data: data as Parameters<typeof tx.insuranceProfile.update>[0]["data"] });
      } else {
        await tx.insuranceProfile.create({
          data: { userId: user.id, personId: id, primary: true, ...data } as Parameters<typeof tx.insuranceProfile.create>[0]["data"],
        });
      }
    }
    // d.insurance undefined → leave insurance untouched.
  });

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });
  const existing = await prisma.person.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Block deletion if the person has booking history (FK + audit safety).
  const reqCount = await prisma.bookingRequest.count({ where: { personId: id } });
  if (reqCount > 0) {
    return NextResponse.json({ error: "person has booking history — cannot delete" }, { status: 400 });
  }
  await prisma.person.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
