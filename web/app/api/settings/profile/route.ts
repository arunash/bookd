import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  name: z.string().max(120).optional(),
  timezone: z.string().min(1).max(60).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: d.name?.trim() || null,
      timezone: d.timezone?.trim() || user.timezone,
      updatedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
