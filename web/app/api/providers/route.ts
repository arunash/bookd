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
});

export async function POST(req: NextRequest) {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;
  const p = await prisma.provider.create({
    data: {
      userId: user.id,
      name: d.name.trim(),
      serviceType: d.serviceType,
      phone: normalizePhone(d.phone),
      phones: (d.phones ?? []).map(normalizePhone),
      address: d.address?.trim() || null,
      website: d.website?.trim() || null,
      email: d.email?.trim() || null,
      notes: d.notes?.trim() || null,
      policy: d.policy ?? "unknown",
      inNetwork: d.inNetwork ?? null,
      acceptedInsuranceCarriers: d.acceptedInsuranceCarriers ?? [],
      active: true,
    },
  });
  return NextResponse.json({ ok: true, id: p.id });
}
