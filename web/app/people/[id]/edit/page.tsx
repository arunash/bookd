import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import { decryptForUser } from "@/lib/crypto";
import PersonForm from "../../person-form";

export const dynamic = "force-dynamic";

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const p = user
    ? await prisma.person.findFirst({ where: { id, userId: user.id }, include: { insurances: true } })
    : null;
  if (!p || !user) notFound();

  const firstName = p.firstNameEnc ? decryptForUser(user.id, new Uint8Array(p.firstNameEnc)) ?? "" : "";
  const lastName  = p.lastNameEnc  ? decryptForUser(user.id, new Uint8Array(p.lastNameEnc))  ?? "" : "";
  const dob       = p.dobEnc       ? decryptForUser(user.id, new Uint8Array(p.dobEnc))       ?? "" : "";

  const ins = p.insurances.find((i) => i.primary) ?? p.insurances[0] ?? null;
  const insurance = ins
    ? {
        carrier: ins.carrier,
        planName: ins.planName ?? "",
        network: ins.network ?? "",
        memberId: decryptForUser(user.id, new Uint8Array(ins.memberIdEnc)) ?? "",
        groupId: ins.groupIdEnc ? decryptForUser(user.id, new Uint8Array(ins.groupIdEnc)) ?? "" : "",
        pcpName: ins.pcpName ?? "",
        insNotes: ins.notes ?? "",
      }
    : null;

  return (
    <Shell narrow>
      <header className="pt-12 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">Edit person</p>
        <h1 className="font-serif text-5xl text-ink mt-2">{firstName} {lastName}</h1>
        <p className="text-ink-2 mt-3 text-base leading-relaxed">Names, DOB and member IDs are re-encrypted on save.</p>
      </header>
      <PersonForm
        initial={{
          id: p.id,
          relationship: p.relationship,
          firstName,
          lastName,
          dob,
          notes: p.notes ?? "",
          insurance,
        }}
      />
    </Shell>
  );
}
