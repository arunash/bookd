import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import ProviderForm from "../../provider-form";

export const dynamic = "force-dynamic";

export default async function EditProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const p = user ? await prisma.provider.findFirst({ where: { id, userId: user.id } }) : null;
  if (!p) notFound();

  return (
    <Shell narrow>
      <header className="pt-12 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">Edit provider</p>
        <h1 className="font-serif text-5xl text-ink mt-2">{p.name}</h1>
        <p className="text-ink-2 mt-3 text-base leading-relaxed">Update details, dialing policy, and phone numbers.</p>
      </header>
      <ProviderForm
        initial={{
          id: p.id,
          name: p.name,
          serviceType: p.serviceType,
          phone: p.phone,
          phones: (p.phones as string[] | null) ?? [],
          address: p.address ?? "",
          website: p.website ?? "",
          email: p.email ?? "",
          notes: p.notes ?? "",
          policy: p.policy,
          inNetwork: p.inNetwork,
          acceptedInsuranceCarriers: (p.acceptedInsuranceCarriers as string[] | null) ?? [],
          active: p.active,
        }}
      />
    </Shell>
  );
}
