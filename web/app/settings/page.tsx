import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import SignOutButton from "./sign-out-button";
import CardForm from "./card-form";
import ProfileForm from "./profile-form";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

function fmtRelative(iso: Date | null): string {
  if (!iso) return "never";
  const ms = Date.now() - iso.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string; msg?: string }> }) {
  const sp = await searchParams;
  const session = await getServerSession(authOptions);
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const gcal = user
    ? await prisma.integration.findUnique({
        where: { userId_provider: { userId: user.id, provider: "google_calendar" } },
      })
    : null;

  const flags = {
    VAPI_API_KEY:           !!process.env.VAPI_API_KEY,
    VAPI_PHONE_NUMBER_ID:   !!process.env.VAPI_PHONE_NUMBER_ID,
    OPENAI_API_KEY:         !!process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY:      !!process.env.ANTHROPIC_API_KEY,
    DATABASE_URL:           !!process.env.DATABASE_URL,
    ENCRYPTION_KEY:         !!process.env.ENCRYPTION_KEY,
    WHATSAPP_ACCESS_TOKEN:  !!process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    GOOGLE_OAUTH_CLIENT_ID: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    USER_CELL_PHONE:        !!process.env.USER_CELL_PHONE,
    PUBLIC_BASE_URL:        !!process.env.PUBLIC_BASE_URL,
  };

  return (
    <Shell narrow>
      <header className="pt-12 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">System</p>
        <h1 className="font-serif text-5xl text-ink mt-2">Settings</h1>
        <p className="text-ink-2 mt-3 text-base leading-relaxed">
          Integrations and credentials.
        </p>
      </header>

      {sp.google === "connected" && (
        <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: "rgba(95,191,148,0.10)", color: "#2F7A5A" }}>
          ✓ Google Calendar connected. Booked appointments will now show up on your primary calendar.
        </div>
      )}
      {sp.google === "error" && (
        <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: "rgba(215,64,107,0.10)", color: "#9B2849" }}>
          Connection failed: {sp.msg ?? "unknown error"}
        </div>
      )}

      <section className="card p-6 mt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">Account</h2>
            <p className="text-[13px] text-ink-3 mt-1.5 leading-relaxed">
              {session?.user?.email ? `Signed in as ${session.user.email}.` : "Not signed in."}
            </p>
          </div>
          {session?.user?.email && <SignOutButton />}
        </div>
        <ProfileForm initial={{ name: user?.name ?? "", timezone: user?.timezone ?? "America/Los_Angeles" }} />
      </section>

      <section className="card p-6 mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">Google Calendar</h2>
            <p className="text-[13px] text-ink-3 mt-1.5 leading-relaxed">
              Connect so successful bookings auto-create calendar events on your primary calendar. Booked never deletes events.
            </p>
          </div>
          {gcal ? (
            <StatusPill kind="ok" text="Connected" />
          ) : (
            <a href="/api/integrations/google/connect" className="btn-coral whitespace-nowrap">
              Connect
            </a>
          )}
        </div>
        {gcal && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
            <Field label="Status">{gcal.active ? "Active" : "Disabled"}</Field>
            <Field label="Last used">{fmtRelative(gcal.lastSyncedAt)}</Field>
            <Field label="Scope"><code className="text-[11px] break-all">{gcal.scope?.slice(0, 80)}…</code></Field>
            {gcal.lastError && <Field label="Last error"><span style={{ color: "#9B2849" }}>{gcal.lastError}</span></Field>}
          </div>
        )}
      </section>

      <section className="card p-6 mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-ink">Card on file</h2>
            <p className="text-[13px] text-ink-3 mt-1.5 leading-relaxed">
              Stored encrypted (AES-256-GCM). The voice agent only reads it out when a receptionist explicitly asks for a deposit / copay / card-on-file. Never given proactively.
            </p>
          </div>
        </div>
        <CardForm existing={user?.cardBrand && user?.cardLast4 ? { brand: user.cardBrand, last4: user.cardLast4 } : null} />
      </section>

      <section className="card p-6 mt-4">
        <h2 className="font-serif text-2xl text-ink">Voice</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
          <Field label="Outbound caller ID"><code className="block bg-soft rounded-xl px-3 py-2 font-mono">+1 (650) 502-6653</code></Field>
          <Field label="LLM">OpenAI gpt-4o</Field>
          <Field label="Voice">ElevenLabs Sarah</Field>
          <Field label="Patch-through target"><code className="block bg-soft rounded-xl px-3 py-2 font-mono">{process.env.USER_CELL_PHONE ?? "—"}</code></Field>
        </div>
      </section>

      <section className="card p-6 mt-4">
        <h2 className="font-serif text-2xl text-ink">WhatsApp</h2>
        <p className="text-[12px] text-ink-3 mt-1">Pending. WhatsApp Business account for +1 (650) 502-6653 not yet provisioned — start bookings via the in-site chat for now.</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
          <Field label="Number"><code className="block bg-soft rounded-xl px-3 py-2 font-mono">+1 (650) 502-6653</code></Field>
          <Field label="Status"><span className="text-ink-3">awaiting WABA setup</span></Field>
        </div>
      </section>

      <section className="card p-6 mt-4">
        <h2 className="font-serif text-2xl text-ink">Integration env vars</h2>
        <p className="text-[12px] text-ink-3 mt-1">Booked never displays secret values — only whether they&apos;re set.</p>
        <ul className="mt-4 divide-y divide-rule">
          {Object.entries(flags).map(([key, set]) => (
            <li key={key} className="flex items-center justify-between py-2.5">
              <span className="text-[13px] font-mono text-ink-2">{key}</span>
              <StatusPill kind={set ? "ok" : "missing"} text={set ? "Set" : "Missing"} />
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3 mb-1">{label}</div>
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

function StatusPill({ kind, text }: { kind: "ok" | "missing"; text: string }) {
  const style = kind === "ok"
    ? { background: "rgba(95,191,148,0.14)", color: "#2F7A5A" }
    : { background: "rgba(215,64,107,0.10)", color: "#9B2849" };
  return (
    <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={style}>
      {text}
    </span>
  );
}
