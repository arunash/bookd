"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DOW = [
  { v: "mon", l: "Mon" }, { v: "tue", l: "Tue" }, { v: "wed", l: "Wed" },
  { v: "thu", l: "Thu" }, { v: "fri", l: "Fri" }, { v: "sat", l: "Sat" }, { v: "sun", l: "Sun" },
];
const HOURS = Array.from({ length: 24 }, (_, h) => ({ v: h, l: `${((h + 11) % 12) + 1} ${h >= 12 ? "PM" : "AM"}` }));

export type BookingEditInitial = {
  id: string;
  personId: string;
  providerId: string | null;
  requestSummary: string;
  notes: string;
  earliestStart: string; // yyyy-mm-dd or ""
  latestStart: string;
  preferredDow: string[];
  preferredHourMin: number | null;
  preferredHourMax: number | null;
};

type Opt = { id: string; label: string };

export default function BookingEditForm({
  initial,
  people,
  providers,
}: {
  initial: BookingEditInitial;
  people: Opt[];
  providers: Opt[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    personId: initial.personId,
    providerId: initial.providerId ?? "",
    requestSummary: initial.requestSummary,
    notes: initial.notes,
    earliestStart: initial.earliestStart,
    latestStart: initial.latestStart,
    preferredHourMin: initial.preferredHourMin,
    preferredHourMax: initial.preferredHourMax,
  });
  const [dow, setDow] = useState<string[]>(initial.preferredDow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDow(v: string) {
    setDow((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        personId: form.personId,
        providerId: form.providerId || null,
        requestSummary: form.requestSummary,
        notes: form.notes || undefined,
        earliestStartIso: form.earliestStart || "",
        latestStartIso: form.latestStart || "",
        preferredDow: dow,
        preferredHourMin: form.preferredHourMin,
        preferredHourMax: form.preferredHourMax,
      };
      const r = await fetch(`/api/bookings/${initial.id}/edit`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) { setError(json.error ?? "Failed"); return; }
      router.push(`/bookings/${initial.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-pop p-6 mt-6 space-y-5">
      <Field label="Person" required>
        <select value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })} className="input">
          {people.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
        </select>
      </Field>

      <Field label="Provider">
        <select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })} className="input">
          <option value="">— Not set —</option>
          {providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
        </select>
      </Field>

      <Field label="What's being asked" required>
        <textarea value={form.requestSummary} onChange={(e) => setForm({ ...form, requestSummary: e.target.value })} className="input resize-none" rows={3} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Earliest date">
          <input type="date" value={form.earliestStart} onChange={(e) => setForm({ ...form, earliestStart: e.target.value })} className="input" />
        </Field>
        <Field label="Latest date">
          <input type="date" value={form.latestStart} onChange={(e) => setForm({ ...form, latestStart: e.target.value })} className="input" />
        </Field>
      </div>

      <Field label="Preferred days">
        <div className="flex flex-wrap gap-2">
          {DOW.map((d) => (
            <button type="button" key={d.v} onClick={() => toggleDow(d.v)}
              className="text-[12px] px-2.5 py-1 rounded-full border"
              style={dow.includes(d.v)
                ? { background: "rgba(238,111,80,0.14)", color: "#B6492C", borderColor: "rgba(238,111,80,0.4)" }
                : { background: "transparent", color: "#4A4A55", borderColor: "var(--rule)" }}>
              {d.l}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Earliest time">
          <select value={form.preferredHourMin ?? ""} onChange={(e) => setForm({ ...form, preferredHourMin: e.target.value === "" ? null : Number(e.target.value) })} className="input">
            <option value="">Any</option>
            {HOURS.map((h) => (<option key={h.v} value={h.v}>{h.l}</option>))}
          </select>
        </Field>
        <Field label="Latest time">
          <select value={form.preferredHourMax ?? ""} onChange={(e) => setForm({ ...form, preferredHourMax: e.target.value === "" ? null : Number(e.target.value) })} className="input">
            <option value="">Any</option>
            {HOURS.map((h) => (<option key={h.v} value={h.v}>{h.l}</option>))}
          </select>
        </Field>
      </div>

      <Field label="Notes for the agent">
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input resize-none" rows={2} placeholder="Anything that helps the call" />
      </Field>

      {error && <p className="text-sm" style={{ color: "#9B2849" }}>{error}</p>}

      <div className="flex items-center justify-between pt-2">
        <a href={`/bookings/${initial.id}`} className="btn-ghost text-sm">Cancel</a>
        <button type="submit" disabled={busy || !form.personId || !form.requestSummary} className="btn-coral">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-1.5">
        {label}{required && <span style={{ color: "var(--primary)" }}> *</span>}
      </div>
      {children}
    </label>
  );
}
