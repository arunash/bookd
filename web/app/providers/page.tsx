import Link from "next/link";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  pt: "Physical therapy",
  ot: "Occupational therapy",
  speech: "Speech therapy",
  doctor: "Doctor",
  dentist: "Dentist",
  therapist: "Therapy",
  salon: "Salon",
  restaurant: "Restaurant",
  other: "Other",
};

const POLICY_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  unknown:        { label: "Untested",      bg: "rgba(27,27,31,0.08)",    fg: "#4A4A55" },
  ai_friendly:    { label: "AI-friendly",   bg: "rgba(95,191,148,0.14)",  fg: "#2F7A5A" },
  patch_through:  { label: "Patch through", bg: "rgba(155,135,245,0.14)", fg: "#5B49B5" },
  human_required: { label: "Human required",bg: "rgba(215,64,107,0.12)",  fg: "#9B2849" },
  online_only:    { label: "Online only",   bg: "rgba(238,111,80,0.12)",  fg: "#B6492C" },
};

export default async function ProvidersPage() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const providers = user
    ? await prisma.provider.findMany({
        where: { userId: user.id, active: true },
        orderBy: [{ serviceType: "asc" }, { name: "asc" }],
      })
    : [];

  return (
    <Shell>
      <header className="pt-12 pb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">Directory</p>
          <h1 className="font-serif text-5xl text-ink mt-2">Providers</h1>
          <p className="text-ink-2 mt-3 text-base leading-relaxed max-w-xl">
            Phone numbers, accepted insurance, dialing policy. Each entry teaches the agent how to handle the next call.
          </p>
        </div>
        <Link href="/providers/new" className="btn-coral whitespace-nowrap mb-1">+ Add provider</Link>
      </header>

      {providers.length === 0 ? (
        <div className="card p-10 text-center mt-6">
          <p className="font-serif text-2xl text-ink">No providers yet</p>
          <p className="text-ink-2 mt-3 text-sm">Add one via WhatsApp by texting <span className="font-mono">/book add provider …</span> or wait for the UI form to land.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {providers.map((p) => {
            const policy = POLICY_LABELS[p.policy] ?? POLICY_LABELS.unknown;
            return (
              <li key={p.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-2xl text-ink">{p.name}</h2>
                    <p className="text-[12px] text-ink-2 mt-0.5">
                      {TYPE_LABELS[p.serviceType] ?? p.serviceType} · <span className="font-mono">{p.phone}</span>
                      {((p.phones as string[] | null) ?? []).length > 0 && <span className="font-mono text-ink-3"> · {((p.phones as string[] | null) ?? []).join(" · ")}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: policy.bg, color: policy.fg }}
                    >
                      {policy.label}
                    </span>
                    <Link href={`/providers/${p.id}/edit`} className="btn-ghost text-[11px] whitespace-nowrap" style={{ color: "#D85B3D" }}>
                      Edit
                    </Link>
                  </div>
                </div>
                {p.address && <p className="mt-3 text-sm text-ink-2">{p.address}</p>}
                {p.notes && <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{p.notes}</p>}
                {p.website && (
                  <p className="mt-3 text-[12px]">
                    <Link href={p.website} target="_blank" className="text-[#D85B3D] hover:underline">
                      {p.website.replace(/^https?:\/\//, "")} ↗
                    </Link>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
