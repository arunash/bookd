import { Shell } from "@/components/shell";
import NewBookingChat from "./chat";
import { prisma } from "@/lib/db";
import { decryptForUser } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  const [people, providers] = user
    ? await Promise.all([
        prisma.person.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
        prisma.provider.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
      ])
    : [[], []];

  const peopleLite = people.map((p) => ({
    id: p.id,
    relationship: p.relationship,
    firstName: user ? decryptForUser(user.id, new Uint8Array(p.firstNameEnc)) ?? "" : "",
  }));

  const providersLite = providers.map((p) => ({
    id: p.id,
    name: p.name,
    serviceType: p.serviceType,
    phone: p.phone,
    policy: p.policy,
  }));

  return (
    <Shell narrow>
      <header className="pt-12 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">New booking</p>
        <h1 className="font-serif text-5xl text-ink mt-2">Tell me what to book.</h1>
        <p className="text-ink-2 mt-3 text-base leading-relaxed">
          Who is it for, what is it for, who should I call. I&apos;ll confirm the script before dialing.
        </p>
      </header>
      <NewBookingChat people={peopleLite} providers={providersLite} />
    </Shell>
  );
}
