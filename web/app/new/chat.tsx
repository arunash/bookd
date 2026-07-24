"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type PersonLite = { id: string; firstName: string; relationship: string };
type ProviderLite = { id: string; name: string; serviceType: string; phone: string; policy: string };

type ChatMessage = { role: "user" | "assistant"; content: string };
type Draft = {
  personId?: string;
  providerId?: string;
  serviceTypeHint?: string;
  requestSummary?: string;
  desiredWindowSummary?: string;
  earliestStartIso?: string;
  latestStartIso?: string;
  preferredDow?: string[];
  preferredHourMin?: number;
  preferredHourMax?: number;
  notes?: string;
};

const GREETING =
  "Hi — who is this booking for, what is it for, and which provider should I call?";

export default function NewBookingChat({ people, providers }: { people: PersonLite[]; providers: ProviderLite[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: GREETING }]);
  const [draft, setDraft] = useState<Draft>({});
  const [ready, setReady] = useState(false);
  const [callScript, setCallScript] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ready]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/bookings/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => m.role !== "assistant" || m.content !== GREETING), draft }),
      });
      const json = await r.json();
      if (!r.ok) { setError(json.error ?? "Request failed"); return; }
      setMessages([...next, { role: "assistant", content: json.message ?? "…" }]);
      setDraft(json.draft ?? draft);
      setReady(!!json.ready);
      if (json.callScript) setCallScript(json.callScript);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function placeCall() {
    if (placing || !ready) return;
    setPlacing(true);
    setError(null);
    try {
      const r = await fetch("/api/bookings/place", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) { setError(json.error ?? "Place failed"); return; }
      router.push(`/bookings/${json.requestId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlacing(false);
    }
  }

  const person = draft.personId ? people.find((p) => p.id === draft.personId) : undefined;
  const provider = draft.providerId ? providers.find((p) => p.id === draft.providerId) : undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 mt-4">
      {/* Chat column */}
      <div className="card-pop p-0 overflow-hidden flex flex-col" style={{ minHeight: 460 }}>
        <div ref={scrollerRef} className="flex-1 overflow-y-auto p-5 space-y-3" style={{ maxHeight: 520 }}>
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} content={m.content} />
          ))}
          {busy && <Bubble role="assistant" content="…" />}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="border-t border-rule p-3 bg-cream/50 flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message…"
            rows={1}
            className="input flex-1 resize-none"
            disabled={busy || placing}
          />
          <button type="submit" disabled={busy || placing || !input.trim()} className="btn-coral">
            {busy ? "…" : "Send"}
          </button>
        </form>
      </div>

      {/* Draft sidebar */}
      <aside className="space-y-4">
        <div className="card p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-semibold">Booking draft</p>
          <DraftRow label="For" value={person ? `${person.firstName} (${person.relationship})` : <Muted>—</Muted>} />
          <DraftRow
            label="Provider"
            value={provider ? <span>{provider.name} <span className="text-ink-3 text-[11px]">· {provider.serviceType.toUpperCase()}</span></span> : <Muted>—</Muted>}
          />
          <DraftRow label="Request" value={draft.requestSummary ?? <Muted>—</Muted>} />
          <DraftRow label="When" value={draft.desiredWindowSummary ?? <Muted>—</Muted>} />
          {draft.notes && <DraftRow label="Notes" value={<span className="text-[12px]">{draft.notes}</span>} />}
        </div>

        {callScript && (
          <div className="card p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-semibold">Script preview</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2 italic">&ldquo;{callScript}&rdquo;</p>
          </div>
        )}

        {ready && (
          <button
            type="button"
            onClick={placeCall}
            disabled={placing}
            className="btn-coral w-full py-3"
          >
            {placing ? "Dialing…" : `Call ${provider?.name ?? "now"}`}
          </button>
        )}

        {error && (
          <div className="card p-3 text-[12px]" style={{ color: "#9B2849", background: "rgba(215,64,107,0.06)" }}>
            {error}
          </div>
        )}

        {/* Helpful refs */}
        <div className="text-[11px] text-ink-3 leading-relaxed">
          Missing a person? <a href="/people/new" className="text-[#D85B3D] hover:underline">Add one</a>.
          <br />
          Provider not on file? <a href="/providers/new" className="text-[#D85B3D] hover:underline">Add it first</a>.
        </div>
      </aside>
    </div>
  );
}

function Bubble({ role, content }: ChatMessage) {
  const me = role === "user";
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${me ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-bl-sm"}`}
        style={
          me
            ? { background: "var(--primary)", color: "#FFF8F1" }
            : { background: "rgba(27,27,31,0.04)", color: "var(--ink)" }
        }
      >
        {content}
      </div>
    </div>
  );
}

function DraftRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium">{label}</div>
      <div className="text-sm text-ink mt-0.5 leading-snug">{value}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-3">{children}</span>;
}
