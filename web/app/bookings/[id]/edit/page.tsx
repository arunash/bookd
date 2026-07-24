import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import { decryptForUser } from "@/lib/crypto";
import BookingEditForm from "./booking-edit-form";

export const dynamic = "force-dynamic";

function ymd(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const reqRow = user ? await prisma.bookingRequest.findFirst({ where: { id, userId: user.id } }) : null;
  if (!reqRow || !user) notFound();
  if (reqRow.status === "booked") redirect(`/bookings/${id}`);

  const [people, providers] = await Promise.all([
    prisma.person.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.provider.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
  ]);

  const peopleOpts = people.map((p) => {
    const fn = p.firstNameEnc ? decryptForUser(user.id, new Uint8Array(p.firstNameEnc)) ?? "" : "";
    const ln = p.lastNameEnc ? decryptForUser(user.id, new Uint8Array(p.lastNameEnc)) ?? "" : "";
    return { id: p.id, label: `${fn} ${ln}`.trim() + ` (${p.relationship})` };
  });
  const providerOpts = providers.map((p) => ({ id: p.id, label: `${p.name} — ${p.phone}` }));

  return (
    <Shell narrow>
      <header className="pt-12 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">Edit request</p>
        <h1 className="font-serif text-4xl text-ink mt-2">Edit booking request</h1>
        <p className="text-ink-2 mt-3 text-sm leading-relaxed">Changes apply to the next call attempt.</p>
      </header>
      <BookingEditForm
        people={peopleOpts}
        providers={providerOpts}
        initial={{
          id: reqRow.id,
          personId: reqRow.personId,
          providerId: reqRow.providerId,
          requestSummary: reqRow.parsedSummary ?? reqRow.rawRequest,
          notes: reqRow.notes ?? "",
          earliestStart: ymd(reqRow.earliestStart),
          latestStart: ymd(reqRow.latestStart),
          preferredDow: (reqRow.preferredDow as string[] | null) ?? [],
          preferredHourMin: reqRow.preferredHourMin,
          preferredHourMax: reqRow.preferredHourMax,
        }}
      />
    </Shell>
  );
}
