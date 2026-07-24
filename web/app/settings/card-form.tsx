"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CardForm({ existing }: { existing: { brand: string; last4: string } | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!existing);
  const [form, setForm] = useState({ holderName: "", number: "", exp: "", cvv: "", zip: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/payment-card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, number: form.number.replace(/\s/g, "") }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      setForm({ holderName: "", number: "", exp: "", cvv: "", zip: "" });
      setEditing(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Remove the card on file? The voice agent will no longer be able to provide payment details on calls.")) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/payment-card", { method: "DELETE" });
      const json = await r.json();
      if (!r.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  if (existing && !editing) {
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-ink">{existing.brand} •••• {existing.last4}</p>
            <p className="text-[11px] text-ink-3 mt-1">Encrypted at rest. The voice agent will only read this when a receptionist explicitly asks.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="btn-ghost text-sm">Replace</button>
            <button onClick={remove} disabled={busy} className="btn-ghost text-sm" style={{ color: "#9B2849" }}>Remove</button>
          </div>
        </div>
        {err && <p className="text-[12px] mt-2" style={{ color: "#9B2849" }}>{err}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-3">
      <Field label="Name on card" required>
        <input value={form.holderName} onChange={(e) => setForm({ ...form, holderName: e.target.value })} className="input" placeholder="Shiva Arunachalam" required autoComplete="cc-name" />
      </Field>
      <Field label="Card number" required>
        <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="input font-mono tracking-wider" placeholder="•••• •••• •••• ••••" inputMode="numeric" autoComplete="cc-number" required />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Exp (MM/YY)" required>
          <input value={form.exp} onChange={(e) => setForm({ ...form, exp: e.target.value })} className="input font-mono" placeholder="01/29" autoComplete="cc-exp" required />
        </Field>
        <Field label="CVV" required>
          <input value={form.cvv} onChange={(e) => setForm({ ...form, cvv: e.target.value })} className="input font-mono" placeholder="123" inputMode="numeric" autoComplete="cc-csc" required />
        </Field>
        <Field label="Billing ZIP" required>
          <input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} className="input font-mono" placeholder="94110" inputMode="numeric" autoComplete="postal-code" required />
        </Field>
      </div>
      {err && <p className="text-[12px]" style={{ color: "#9B2849" }}>{err}</p>}
      <div className="flex items-center justify-between pt-1">
        {existing ? (
          <button type="button" onClick={() => { setEditing(false); setErr(null); }} className="btn-ghost text-sm">Cancel</button>
        ) : <span />}
        <button type="submit" disabled={busy} className="btn-coral">{busy ? "Saving…" : "Save card"}</button>
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
