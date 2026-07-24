import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import { decryptForUser } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const people = user
    ? await prisma.person.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        include: { insurances: true },
      })
    : [];

  return (
    <Shell>
      <header className="pt-12 pb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">Patients & guests</p>
          <h1 className="font-serif text-5xl text-ink mt-2">People</h1>
          <p className="text-ink-2 mt-3 text-base leading-relaxed max-w-xl">
            Who you book for. Names and DOBs are encrypted at rest — only decrypted at call placement.
          </p>
        </div>
        <a href="/people/new" className="btn-coral whitespace-nowrap mb-1">+ Add person</a>
      </header>

      {people.length === 0 ? (
        <div className="card p-10 text-center mt-6">
          <p className="font-serif text-2xl text-ink">Nobody added yet</p>
          <p className="text-ink-2 mt-3 text-sm">Use the seed script to add the first person.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {people.map((p) => {
            const firstName = p.firstNameEnc ? decryptForUser(user!.id, new Uint8Array(p.firstNameEnc)) : null;
            const lastName  = p.lastNameEnc  ? decryptForUser(user!.id, new Uint8Array(p.lastNameEnc))  : null;
            const dob       = p.dobEnc       ? decryptForUser(user!.id, new Uint8Array(p.dobEnc))       : null;
            const ins = p.insurances.find((i) => i.primary) ?? p.insurances[0];
            return (
              <li key={p.id} className="card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-2xl text-ink">
                      {firstName} {lastName}
                    </h2>
                    <p className="text-[12px] text-ink-2 mt-0.5">
                      {p.relationship} {dob ? `· DOB ${dob}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] uppercase tracking-wider text-ink-3">encrypted</span>
                    <a href={`/people/${p.id}/edit`} className="btn-ghost text-[11px] whitespace-nowrap" style={{ color: "#D85B3D" }}>Edit</a>
                  </div>
                </div>
                {ins && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                    <Row label="Insurance">{ins.carrier}{ins.planName ? ` · ${ins.planName}` : ""}</Row>
                    <Row label="Network">{ins.network ?? "—"}</Row>
                    <Row label="Member ID">••••••• {`(encrypted)`}</Row>
                    <Row label="Group">{ins.groupIdEnc ? "••••••• (encrypted)" : "—"}</Row>
                    {ins.notes && <Row label="Notes" full>{ins.notes}</Row>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

function Row({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-1">{label}</div>
      <div className="text-ink-2">{children}</div>
    </div>
  );
}
