import Link from "next/link";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import RetryButton from "@/components/retry-button";

export const dynamic = "force-dynamic";

function fmtRel(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" });
}

const STATUS_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  queued:           { label: "Queued",      bg: "rgba(155,135,245,0.14)", fg: "#5B49B5" },
  in_progress:      { label: "In flight",   bg: "rgba(238,111,80,0.14)",  fg: "#B6492C" },
  booked:           { label: "Booked",      bg: "rgba(95,191,148,0.14)",  fg: "#2F7A5A" },
  failed:           { label: "Failed",      bg: "rgba(215,64,107,0.14)",  fg: "#9B2849" },
  cancelled:        { label: "Cancelled",   bg: "rgba(27,27,31,0.08)",    fg: "#4A4A55" },
  needs_user_input: { label: "Needs input", bg: "rgba(238,111,80,0.10)",  fg: "#B6492C" },
};

const OUTCOME_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  unknown:              { label: "Pending",        bg: "rgba(27,27,31,0.08)",   fg: "#4A4A55" },
  booked:               { label: "Booked",         bg: "rgba(95,191,148,0.14)", fg: "#2F7A5A" },
  patched_then_booked:  { label: "Patched ✓",      bg: "rgba(95,191,148,0.14)", fg: "#2F7A5A" },
  voicemail_left:       { label: "Voicemail left", bg: "rgba(155,135,245,0.14)", fg: "#5B49B5" },
  voicemail_no_message: { label: "Voicemail (skipped)", bg: "rgba(155,135,245,0.10)", fg: "#5B49B5" },
  no_answer:            { label: "No answer",      bg: "rgba(238,111,80,0.10)", fg: "#B6492C" },
  busy:                 { label: "Busy",           bg: "rgba(238,111,80,0.10)", fg: "#B6492C" },
  refused_by_provider:  { label: "Refused",        bg: "rgba(215,64,107,0.12)", fg: "#9B2849" },
  not_accepting_patients: { label: "Not taking patients", bg: "rgba(215,64,107,0.12)", fg: "#9B2849" },
  error:                { label: "Error",          bg: "rgba(215,64,107,0.12)", fg: "#9B2849" },
};

export default async function BookingsPage() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const requests = user
    ? await prisma.bookingRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        include: {
          provider: { select: { name: true, serviceType: true } },
          calls: { orderBy: { createdAt: "desc" }, select: { id: true, startedAt: true, endedAt: true, outcome: true, outcomeDetail: true, recordingUrl: true } },
          booking: true,
        },
      })
    : [];

  return (
    <Shell>
      <header className="pt-12 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">All requests</p>
        <h1 className="font-serif text-5xl text-ink mt-2">Bookings</h1>
        <p className="text-ink-2 mt-3 text-base leading-relaxed max-w-xl">
          Every WhatsApp request you sent, every call the agent placed, and what landed on your calendar.
        </p>
      </header>

      {requests.length === 0 ? (
        <div className="card p-10 text-center mt-6">
          <p className="font-serif text-2xl text-ink">Nothing yet</p>
          <p className="text-ink-2 mt-3 text-sm">Open the <Link href="/new" className="text-[#D85B3D] underline-offset-4 hover:underline">in-site chat</Link> to queue your first one. WhatsApp is coming.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {requests.map((r) => {
            const sp = STATUS_PILL[r.status] ?? STATUS_PILL.queued;
            const canRetry = !["booked", "cancelled", "queued", "in_progress"].includes(r.status);
            return (
              <li key={r.id} className="card p-5 hover:-translate-y-0.5 transition-transform">
                <Link href={`/bookings/${r.id}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-2xl text-ink">{r.provider?.name ?? "Provider not set"}</h2>
                    <p className="text-[12px] text-ink-2 mt-0.5">
                      {(r.provider?.serviceType ?? r.serviceTypeHint ?? "—").toUpperCase()} · {fmtRel(r.createdAt)} · {r.attempts} attempt{r.attempts === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full" style={{ background: sp.bg, color: sp.fg }}>
                    {sp.label}
                  </span>
                </div>

                {r.rawRequest && (
                  <p className="mt-3 text-sm text-ink-2 leading-relaxed">
                    <span className="text-ink-3">You said: </span>“{r.rawRequest}”
                  </p>
                )}

                {/* Booked outcome */}
                {r.booking && (
                  <div className="mt-4 p-3 rounded-xl" style={{ background: "rgba(95,191,148,0.10)" }}>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-[#2F7A5A]">Booked</p>
                    <p className="text-sm text-ink mt-1">
                      {new Date(r.booking.scheduledStart).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
                      {r.booking.confirmationNumber && <span className="text-ink-2"> · confirmation #{r.booking.confirmationNumber}</span>}
                    </p>
                    {r.booking.prepInstructions && <p className="text-[12px] text-ink-2 mt-1">{r.booking.prepInstructions}</p>}
                  </div>
                )}

                {/* Calls */}
                {r.calls.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-2">Call attempts</p>
                    <ul className="space-y-3">
                      {r.calls.map((c) => {
                        const op = OUTCOME_PILL[c.outcome] ?? OUTCOME_PILL.unknown;
                        return (
                          <li key={c.id}>
                            <div className="flex items-center gap-3 flex-wrap text-sm">
                              <span className="text-[11px] text-ink-3 font-mono w-24 shrink-0">{c.startedAt ? new Date(c.startedAt).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) : "—"}</span>
                              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full" style={{ background: op.bg, color: op.fg }}>
                                {op.label}
                              </span>
                              {c.recordingUrl && (
                                <a href={c.recordingUrl} target="_blank" className="text-[11px] text-[#D85B3D] hover:underline ml-auto">▶ recording</a>
                              )}
                            </div>
                            {c.outcomeDetail && (
                              <p className="text-[13px] text-ink-2 mt-1 ml-[6.25rem] leading-relaxed">{c.outcomeDetail}</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                </Link>
                {canRetry && (
                  <div className="mt-3 pt-3 border-t border-rule flex justify-end">
                    <RetryButton requestId={r.id} requestSummary={r.rawRequest} providerName={r.provider?.name} />
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
