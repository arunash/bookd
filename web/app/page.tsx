import Link from "next/link";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import { decryptForUser } from "@/lib/crypto";
import CloseOutButton from "./close-out-button";
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

// Vapi sometimes hands us its raw endedReason in lieu of a real classification
// (e.g. "assistant-forwarded-call"). Don't show those as summaries — they're
// machine codes, not text-message-style updates.
function isRealSummary(detail: string | null | undefined): boolean {
  if (!detail) return false;
  const t = detail.trim();
  if (t.length < 12) return false;
  // kebab-case all-lowercase tokens = Vapi reason, not a sentence
  if (/^[a-z][a-z0-9-]+$/i.test(t) && t.includes("-")) return false;
  return true;
}

function safeProviderName(name: string | null | undefined, rawRequest: string): string {
  const n = (name ?? "").trim();
  if (n.length >= 2) return n;
  // Fall back to the first short snippet of the request itself.
  const first = rawRequest.split(/[\n.!?]/)[0].trim();
  return first.slice(0, 60) || "Untitled request";
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
  unknown:              { label: "Pending",        bg: "rgba(27,27,31,0.08)", fg: "#4A4A55" },
  booked:               { label: "Booked",         bg: "rgba(95,191,148,0.14)", fg: "#2F7A5A" },
  patched_then_booked:  { label: "Patched ✓",      bg: "rgba(95,191,148,0.14)", fg: "#2F7A5A" },
  patched_unanswered:   { label: "Patch missed",   bg: "rgba(215,64,107,0.10)", fg: "#9B2849" },
  voicemail_left:       { label: "Voicemail",      bg: "rgba(155,135,245,0.14)", fg: "#5B49B5" },
  no_answer:            { label: "No answer",      bg: "rgba(238,111,80,0.10)", fg: "#B6492C" },
  busy:                 { label: "Busy",           bg: "rgba(238,111,80,0.10)", fg: "#B6492C" },
  refused_by_provider:  { label: "Refused",        bg: "rgba(215,64,107,0.12)", fg: "#9B2849" },
  not_accepting_patients: { label: "Not taking patients", bg: "rgba(215,64,107,0.12)", fg: "#9B2849" },
  error:                { label: "Error",          bg: "rgba(215,64,107,0.12)", fg: "#9B2849" },
  hung_up:              { label: "Hung up",        bg: "rgba(215,64,107,0.10)", fg: "#9B2849" },
  voicemail_no_message: { label: "VM skipped",     bg: "rgba(155,135,245,0.10)", fg: "#5B49B5" },
};

const PENDING_STATUSES = new Set(["queued", "in_progress", "needs_user_input", "failed"]);

export default async function Home() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    return (
      <Shell narrow>
        <header className="pt-12 pb-6">
          <h1 className="font-serif text-3xl text-ink">Welcome to book-d</h1>
          <p className="text-ink-2 mt-3">No user record yet. Add a person + provider to start.</p>
        </header>
      </Shell>
    );
  }

  const requests = await prisma.bookingRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      provider: { select: { name: true, serviceType: true } },
      person: { select: { id: true, firstNameEnc: true, relationship: true } },
      calls: { orderBy: { createdAt: "desc" }, select: { id: true, startedAt: true, endedAt: true, outcome: true, outcomeDetail: true, recordingUrl: true, durationSec: true } },
      booking: true,
    },
  });

  const pending = requests.filter((r) => PENDING_STATUSES.has(r.status));
  const confirmed = requests.filter((r) => r.status === "booked");
  const closed = requests.filter((r) => r.status === "cancelled");
  const totalAttempts = requests.reduce((acc, r) => acc + r.calls.length, 0);

  return (
    <Shell narrow>
      <header className="pt-12 pb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">Dashboard</p>
          <h1 className="font-serif text-3xl sm:text-4xl text-ink mt-1.5">Bookings</h1>
        </div>
        <Link href="/new" className="btn-coral text-sm">+ New booking</Link>
      </header>

      <div className="flex items-center gap-1 sm:gap-2 text-[11px] text-ink-2 py-3 border-y border-rule">
        <Stat label="pending" value={pending.length} />
        <Sep />
        <Stat label="booked" value={confirmed.length} />
        <Sep />
        <Stat label="cancelled" value={closed.length} />
        <Sep />
        <Stat label="calls" value={totalAttempts} />
      </div>

      {pending.length > 0 && (
        <Group title="Needs attention">
          {pending.map((r) => <RequestCard key={r.id} request={r} userId={user.id} showCloseOut />)}
        </Group>
      )}

      {confirmed.length > 0 && (
        <Group title="Confirmed">
          {confirmed.map((r) => <RequestCard key={r.id} request={r} userId={user.id} />)}
        </Group>
      )}

      {closed.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-[11px] uppercase tracking-[0.18em] text-ink-3 font-semibold py-2">
            Cancelled · {closed.length}
          </summary>
          <div className="mt-2 space-y-2">
            {closed.map((r) => <RequestCard key={r.id} request={r} userId={user.id} />)}
          </div>
        </details>
      )}

      {requests.length === 0 && (
        <div className="card p-10 text-center mt-6">
          <p className="font-serif text-2xl text-ink">No bookings yet</p>
          <p className="text-ink-2 mt-3 text-sm">
            Open the <Link href="/new" className="text-[#D85B3D] underline-offset-4 hover:underline">in-site chat</Link> to queue your first one.
          </p>
        </div>
      )}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 px-2">
      <span className="font-mono-num font-serif text-ink text-lg">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-ink-3">{label}</span>
    </span>
  );
}

function Sep() {
  return <span className="text-ink-3 select-none" aria-hidden>·</span>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[11px] uppercase tracking-[0.2em] text-ink-3 font-semibold mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

type RequestRow = {
  id: string;
  status: string;
  attempts: number;
  createdAt: Date;
  rawRequest: string;
  notes: string | null;
  provider: { name: string; serviceType: string } | null;
  person: { id: string; firstNameEnc: Uint8Array; relationship: string };
  calls: Array<{ id: string; startedAt: Date | null; endedAt: Date | null; outcome: string; outcomeDetail: string | null; recordingUrl: string | null; durationSec: number | null }>;
  booking: { scheduledStart: Date; confirmationNumber: string | null } | null;
};

function RequestCard({ request, userId, showCloseOut }: { request: RequestRow; userId: string; showCloseOut?: boolean }) {
  const sp = STATUS_PILL[request.status] ?? STATUS_PILL.queued;
  const firstName = decryptForUser(userId, new Uint8Array(request.person.firstNameEnc)) ?? "(name unavailable)";
  const title = safeProviderName(request.provider?.name, request.rawRequest);
  const latest = request.calls[0];
  // Retry is offered once a request has stalled — not while a call is pending or
  // already booked/closed. Server still enforces business-hours + cooldown.
  const canRetry = !["booked", "cancelled", "queued", "in_progress"].includes(request.status);

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/bookings/${request.id}`} className="block min-w-0 flex-1 group">
          <h3 className="font-serif text-lg text-ink truncate group-hover:underline underline-offset-4">{title}</h3>
          <p className="text-[11px] text-ink-3 mt-0.5">
            {(request.provider?.serviceType ?? "—").toUpperCase()} · {firstName} ({request.person.relationship}) · {fmtRel(request.createdAt)}{request.attempts > 0 && ` · ${request.attempts} call${request.attempts === 1 ? "" : "s"}`}
          </p>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: sp.bg, color: sp.fg }}>
            {sp.label}
          </span>
          {canRetry && <RetryButton requestId={request.id} requestSummary={request.rawRequest} providerName={title} />}
          {showCloseOut && <CloseOutButton requestId={request.id} />}
        </div>
      </div>

      {request.booking && (
        <div className="mt-2.5 px-3 py-2 rounded-lg flex items-baseline justify-between gap-2" style={{ background: "rgba(95,191,148,0.10)" }}>
          <span className="text-sm text-ink">{request.booking.scheduledStart.toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          {request.booking.confirmationNumber && (
            <span className="text-[10px] text-ink-3 font-mono">#{request.booking.confirmationNumber}</span>
          )}
        </div>
      )}

      {latest && (
        <div className="mt-2.5 pt-2.5 border-t border-rule">
          <div className="flex items-center gap-2 text-[11px] flex-wrap">
            <span className="text-ink-3 font-mono">
              {latest.startedAt ? latest.startedAt.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) : "queued"}
            </span>
            {latest.outcome !== "unknown" && (
              <span className="uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full" style={{ background: (OUTCOME_PILL[latest.outcome] ?? OUTCOME_PILL.unknown).bg, color: (OUTCOME_PILL[latest.outcome] ?? OUTCOME_PILL.unknown).fg, fontSize: "9px" }}>
                {(OUTCOME_PILL[latest.outcome] ?? OUTCOME_PILL.unknown).label}
              </span>
            )}
            {latest.durationSec != null && <span className="text-ink-3">{latest.durationSec}s</span>}
            {latest.recordingUrl && (
              <a href={latest.recordingUrl} target="_blank" rel="noopener" className="text-[#D85B3D] hover:underline whitespace-nowrap ml-auto">▶ recording</a>
            )}
          </div>
          {isRealSummary(latest.outcomeDetail) && (
            <p className="text-[12.5px] text-ink-2 mt-1 leading-snug">{latest.outcomeDetail}</p>
          )}
          {request.calls.length > 1 && (
            <Link href={`/bookings/${request.id}`} className="text-[10px] text-ink-3 hover:text-ink mt-1 inline-block">
              +{request.calls.length - 1} earlier attempt{request.calls.length - 1 === 1 ? "" : "s"}
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
