"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RELATIONSHIPS = [
  { value: "self",     label: "Myself" },
  { value: "daughter", label: "Daughter" },
  { value: "son",      label: "Son" },
  { value: "spouse",   label: "Spouse / partner" },
  { value: "parent",   label: "Parent" },
  { value: "other",    label: "Other" },
];

export type PersonInitial = {
  id: string;
  relationship: string;
  firstName: string;
  lastName: string;
  dob: string;
  notes: string;
  insurance: {
    carrier: string;
    planName: string;
    network: string;
    memberId: string;
    groupId: string;
    pcpName: string;
    insNotes: string;
  } | null;
};

export default function PersonForm({ initial }: { initial?: PersonInitial }) {
  const router = useRouter();
  const editing = !!initial?.id;
  const ins = initial?.insurance;
  const [form, setForm] = useState({
    relationship: initial?.relationship ?? "daughter",
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    dob: initial?.dob ?? "",
    notes: initial?.notes ?? "",
    addInsurance: editing ? !!ins : true,
    carrier: ins?.carrier ?? "",
    planName: ins?.planName ?? "",
    network: ins?.network || "PPO",
    memberId: ins?.memberId ?? "",
    groupId: ins?.groupId ?? "",
    pcpName: ins?.pcpName ?? "",
    insNotes: ins?.insNotes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        relationship: form.relationship,
        firstName: form.firstName,
        lastName: form.lastName || undefined,
        dob: form.dob || undefined,
        notes: form.notes || undefined,
      };
      if (form.addInsurance && form.carrier && form.memberId) {
        body.insurance = {
          carrier: form.carrier,
          planName: form.planName || undefined,
          network: form.network || undefined,
          memberId: form.memberId,
          groupId: form.groupId || undefined,
          pcpName: form.pcpName || undefined,
          notes: form.insNotes || undefined,
        };
      } else if (editing) {
        // Explicitly clear insurance when the box is unchecked on edit.
        body.insurance = null;
      }
      const r = await fetch(editing ? `/api/people/${initial!.id}` : "/api/people", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) { setError(json.error ?? "Failed"); return; }
      router.push("/people");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-pop p-6 mt-6 space-y-5">
      <Section title="Identity">
        <Field label="Relationship" required>
          <select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} className="input">
            {RELATIONSHIPS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input" placeholder="Aadhya" required />
          </Field>
          <Field label="Last name">
            <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input" placeholder="Shiva" />
          </Field>
        </div>
        <Field label="Date of birth">
          <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className="input" />
        </Field>
        <Field label="Notes (non-PHI)">
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" placeholder="e.g. preferred pronoun, communication needs" />
        </Field>
      </Section>

      <div className="border-t border-rule" />

      <Section title="Insurance">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.addInsurance} onChange={(e) => setForm({ ...form, addInsurance: e.target.checked })} />
          <span>{editing ? "Keep / edit primary insurance" : "Add primary insurance now"}</span>
        </label>
        {form.addInsurance && (
          <div className="space-y-3 mt-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Carrier" required>
                <input value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} className="input" placeholder="Anthem Blue Cross" />
              </Field>
              <Field label="Plan name">
                <input value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })} className="input" placeholder="gHIP" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Network">
                <select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} className="input">
                  <option>PPO</option><option>HMO</option><option>EPO</option><option>POS</option><option>HDHP</option><option>Other</option>
                </select>
              </Field>
              <Field label="Member ID" required>
                <input value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} className="input font-mono" placeholder="ABC123456789" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Group number">
                <input value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} className="input font-mono" placeholder="174134M7A1" />
              </Field>
              <Field label="PCP name">
                <input value={form.pcpName} onChange={(e) => setForm({ ...form, pcpName: e.target.value })} className="input" />
              </Field>
            </div>
            <Field label="Insurance notes (Plan Code, RxBIN, etc.)">
              <input value={form.insNotes} onChange={(e) => setForm({ ...form, insNotes: e.target.value })} className="input" />
            </Field>
          </div>
        )}
      </Section>

      {error && <p className="text-sm" style={{ color: "#9B2849" }}>{error}</p>}

      <div className="flex items-center justify-between pt-2">
        <a href="/people" className="btn-ghost text-sm">Cancel</a>
        <button type="submit" disabled={busy || !form.firstName} className="btn-coral">
          {busy ? "Saving…" : editing ? "Save changes" : "Save person"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="font-serif text-2xl text-ink">{title}</h2>
      {children}
    </div>
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
