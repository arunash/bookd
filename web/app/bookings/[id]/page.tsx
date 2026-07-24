import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import { decryptForUser } from "@/lib/crypto";
import AutoRefresh from "./auto-refresh";
import RetryButton from "@/components/retry-button";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
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
  unknown:              { label: "Pending",        bg: "rgba(27,27,31,0.08)",    fg: "#4A4A55" },
  booked:               { label: "Booked",         bg: "rgba(95,191,148,0.14)",  fg: "#2F7A5A" },
  patched_then_booked:  { label: "Patched ✓",      bg: "rgba(95,191,148,0.14)",  fg: "#2F7A5A" },
  voicemail_left:       { label: "Voicemail left", bg: "rgba(155,135,245,0.14)", fg: "#5B49B5" },
  voicemail_no_message: { label: "VM (no msg)",    bg: "rgba(155,135,245,0.10)", fg: "#5B49B5" },
  no_answer:            { label: "No answer",      bg: "rgba(238,111,80,0.10)",  fg: "#B6492C" },
  busy:                 { label: "Busy",           bg: "rgba(238,111,80,0.10)",  fg: "#B6492C" },
  refused_by_provider:  { label: "Refused",        bg: "rgba(215,64,107,0.12)",  fg: "#9B2849" },
  not_accepting_patients: { label: "Not taking patients", bg: "rgba(215,64,107,0.12)", fg: "#9B2849" },
  error:                { label: "Error",          bg: "rgba(215,64,107,0.12)",  fg: "#9B2849" },
  hung_up:              { label: "Hung up",        bg: "rgba(215,64,107,0.10)",  fg: "#9B2849" },
};

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await prisma.bookingRequest.findUnique({
    where: { id },
    include: {
      provider: true,
      person: true,
      calls: { orderBy: { createdAt: "asc" }, include: { events: { orderBy: { createdAt: "asc" } } } },
      booking: true,
    },
  });
  if (!req) notFound();

  const firstName = req.person.firstNameEnc ? decryptForUser(req.person.userId, new Uint8Array(req.person.firstNameEnc)) : null;
  const lastName  = req.person.lastNameEnc  ? decryptForUser(req.person.userId, new Uint8Array(req.person.lastNameEnc))  : null;
  const sp = STATUS_PILL[req.status] ?? STATUS_PILL.queued;

  const callPending = req.calls.some((c) => !c.endedAt) || req.status === "in_progress" || req.status === "queued";

  return (
    <Shell narrow>
      <AutoRefresh active={callPending} />
      <div className="pt-12 pb-2">
        <Link href="/bookings" className="text-sm text-ink-3 hover:text-ink">← All bookings</Link>
      </div>
      <header className="pt-2 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">{req.provider?.serviceType?.toUpperCase() ?? "REQUEST"}</p>
            <h1 className="font-serif text-5xl text-ink mt-2">{req.provider?.name ?? "Provider not set"}</h1>
            <p className="text-ink-2 mt-2 text-sm">
              For {firstName} {lastName} · queued {fmt(req.createdAt)} · {req.attempts} attempt{req.attempts === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: sp.bg, color: sp.fg }}>
              {sp.label}
            </span>
            {!callPending && req.status !== "booked" && !req.booking && (
              <RetryButton requestId={req.id} requestSummary={req.rawRequest} providerName={req.provider?.name} />
            )}
            {req.status !== "booked" && !req.booking && (
              <Link href={`/bookings/${req.id}/edit`} className="btn-ghost text-[11px] whitespace-nowrap" style={{ color: "#D85B3D" }}>
                Edit request
              </Link>
            )}
          </div>
        </div>
      </header>

      {req.rawRequest && (
        <section className="card p-5 mt-2">
          <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-2">Original request</div>
          <p className="text-[15px] text-ink leading-relaxed">“{req.rawRequest}”</p>
          {req.notes && <p className="mt-3 text-[13px] text-ink-2 leading-relaxed">{req.notes}</p>}
        </section>
      )}

      {req.booking && (
        <section className="card-pop p-6 mt-4">
          <p className="text-[11px] uppercase tracking-wider text-[#2F7A5A] font-semibold">Confirmed</p>
          <p className="font-serif text-3xl text-ink mt-1">{fmt(req.booking.scheduledStart)}</p>
          {req.booking.location && <p className="text-sm text-ink-2 mt-1">{req.booking.location}</p>}
          {req.booking.confirmationNumber && <p className="text-[12px] text-ink-3 mt-1">Confirmation # {req.booking.confirmationNumber}</p>}
          {req.booking.prepInstructions && <p className="mt-3 text-[13px] text-ink-2 leading-relaxed">{req.booking.prepInstructions}</p>}
          {req.booking.calendarEventId && (
            <p className="text-[12px] mt-2">
              <a className="text-[#D85B3D] hover:underline" target="_blank" href={`https://calendar.google.com/calendar/u/0/r/eventedit/${req.booking.calendarEventId}`}>
                Open in Google Calendar ↗
              </a>
            </p>
          )}
        </section>
      )}

      <h2 className="font-serif text-2xl text-ink mt-12 mb-3">Call attempts</h2>
      {req.calls.length === 0 ? (
        <div className="card p-6 text-sm text-ink-3">No call attempts yet.</div>
      ) : (
        <ol className="space-y-4">
          {req.calls.map((c, i) => {
            const op = OUTCOME_PILL[c.outcome] ?? OUTCOME_PILL.unknown;
            const transcript = c.transcriptEnc ? decryptForUser(c.userId, new Uint8Array(c.transcriptEnc)) : null;
            const duration = c.startedAt && c.endedAt ? Math.round((c.endedAt.getTime() - c.startedAt.getTime()) / 1000) : null;
            return (
              <li key={c.id} className="card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-ink-3">Attempt {i + 1}</p>
                    <p className="text-sm text-ink mt-0.5">{fmt(c.startedAt)} {duration != null && <span className="text-ink-3">· {duration}s</span>} {c.costUsd != null && <span className="text-ink-3">· ${c.costUsd.toFixed(2)}</span>}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: op.bg, color: op.fg }}>
                    {op.label}
                  </span>
                </div>

                {c.outcomeDetail && <p className="mt-3 text-[13px] text-ink-2">{c.outcomeDetail}</p>}

                {c.patchedToUser && (
                  <p className="mt-2 text-[12px]" style={{ color: "#5B49B5" }}>
                    Patched to {process.env.USER_CELL_PHONE} at {fmt(c.patchAt)}
                  </p>
                )}

                {c.recordingUrl && (
                  <div className="mt-3">
                    <audio src={c.recordingUrl} controls className="w-full" />
                  </div>
                )}

                {transcript && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[12px] uppercase tracking-wider text-ink-3 font-semibold">
                      Transcript
                    </summary>
                    <pre className="mt-2 text-[12px] text-ink-2 bg-soft rounded-xl px-3 py-2 whitespace-pre-wrap leading-relaxed font-sans">
                      {transcript}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Shell>
  );
}
