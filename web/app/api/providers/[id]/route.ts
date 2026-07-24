import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const Schema = z.object({
  name: z.string().min(1).max(200),
  serviceType: z.enum(["pt", "ot", "speech", "doctor", "dentist", "therapist", "salon", "restaurant", "other"]),
  phone: z.string().min(7).max(20),
  phones: z.array(z.string().min(7).max(20)).optional(),
  address: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
  policy: z.enum(["unknown", "ai_friendly", "patch_through", "human_required", "online_only"]).optional(),
  inNetwork: z.boolean().nullable().optional(),
  acceptedInsuranceCarriers: z.array(z.string().min(1).max(80)).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const existing = await prisma.provider.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  await prisma.provider.update({
    where: { id },
    data: {
      name: d.name.trim(),
      serviceType: d.serviceType,
      phone: normalizePhone(d.phone),
      phones: (d.phones ?? []).map(normalizePhone),
      address: d.address?.trim() || null,
      website: d.website?.trim() || null,
      email: d.email?.trim() || null,
      notes: d.notes?.trim() || null,
      policy: d.policy ?? existing.policy,
      inNetwork: d.inNetwork ?? null,
      acceptedInsuranceCarriers: d.acceptedInsuranceCarriers ?? [],
      active: d.active ?? existing.active,
      updatedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });
  const existing = await prisma.provider.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Soft delete — keep call/booking history intact.
  await prisma.provider.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
