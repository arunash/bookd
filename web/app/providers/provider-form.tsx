"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SERVICE_TYPES = [
  { value: "pt",        label: "Physical therapy (PT)" },
  { value: "ot",        label: "Occupational therapy (OT)" },
  { value: "speech",    label: "Speech therapy" },
  { value: "doctor",    label: "Doctor / pediatrician" },
  { value: "dentist",   label: "Dentist" },
  { value: "therapist", label: "Mental-health therapist" },
  { value: "salon",     label: "Salon" },
  { value: "restaurant",label: "Restaurant" },
  { value: "other",     label: "Other" },
];

const POLICIES = [
  { value: "unknown",        label: "Untested — agent decides" },
  { value: "ai_friendly",    label: "AI-friendly — agent books end-to-end" },
  { value: "patch_through",  label: "Patch-through — agent opens, patches you in to book" },
  { value: "human_required", label: "Human required — patch you in on connect" },
  { value: "online_only",    label: "Online only — never call" },
];

export type ProviderInitial = {
  id: string;
  name: string;
  serviceType: string;
  phone: string;
  phones: string[];
  address: string;
  website: string;
  email: string;
  notes: string;
  policy: string;
  inNetwork: boolean | null;
  acceptedInsuranceCarriers: string[];
  active: boolean;
};

export default function ProviderForm({ initial }: { initial?: ProviderInitial }) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    serviceType: initial?.serviceType ?? "pt",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    website: initial?.website ?? "",
    email: initial?.email ?? "",
    notes: initial?.notes ?? "",
    policy: initial?.policy ?? "unknown",
    inNetwork: initial?.inNetwork == null ? "" : initial.inNetwork ? "yes" : "no",
    acceptedInsurance: (initial?.acceptedInsuranceCarriers ?? []).join(", "),
  });
  const [phones, setPhones] = useState<string[]>(initial?.phones ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        serviceType: form.serviceType,
        phone: form.phone,
        phones: phones.map((p) => p.trim()).filter(Boolean),
        address: form.address,
        website: form.website,
        email: form.email,
        notes: form.notes,
        policy: form.policy,
        inNetwork: form.inNetwork === "" ? null : form.inNetwork === "yes",
        acceptedInsuranceCarriers: form.acceptedInsurance.split(",").map((s) => s.trim()).filter(Boolean),
      };
      const r = await fetch(editing ? `/api/providers/${initial!.id}` : "/api/providers", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error ?? "Failed to save");
        return;
      }
      router.push("/providers");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-pop p-6 mt-6 space-y-5">
      <Field label="Practice name" required>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} className="input" placeholder="e.g. Starfish Therapies" required />
      </Field>

      <Field label="Service type" required>
        <select value={form.serviceType} onChange={(e) => set("serviceType", e.target.value)} className="input">
          {SERVICE_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
        </select>
      </Field>

      <Field label="Primary phone" required>
        <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="input" placeholder="(415) 555-0100" required />
        <p className="text-[11px] text-ink-3 mt-1">The number the agent dials first.</p>
      </Field>

      <Field label="Additional phone numbers">
        <div className="space-y-2">
          {phones.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={p}
                onChange={(e) => setPhones((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                className="input flex-1"
                placeholder="(650) 555-0142 — e.g. scheduling line"
              />
              <button type="button" onClick={() => setPhones((arr) => arr.filter((_, j) => j !== i))} className="btn-ghost text-sm whitespace-nowrap" style={{ color: "#9B2849" }}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setPhones((arr) => [...arr, ""])} className="btn-ghost text-sm" style={{ color: "#D85B3D" }}>
            + Add number
          </button>
        </div>
      </Field>

      <Field label="Dialing policy">
        <select value={form.policy} onChange={(e) => set("policy", e.target.value)} className="input">
          {POLICIES.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="In-network (medical)">
          <select value={form.inNetwork} onChange={(e) => set("inNetwork", e.target.value)} className="input">
            <option value="">Unknown</option>
            <option value="yes">In-network</option>
            <option value="no">Out-of-network</option>
          </select>
        </Field>
        <Field label="Accepted insurance (comma-separated)">
          <input value={form.acceptedInsurance} onChange={(e) => set("acceptedInsurance", e.target.value)} className="input" placeholder="Aetna, BCBS, Cigna" />
        </Field>
      </div>

      <Field label="Address">
        <input value={form.address} onChange={(e) => set("address", e.target.value)} className="input" placeholder="1640 Valencia St, San Francisco, CA 94110" />
      </Field>

      <Field label="Website">
        <input value={form.website} onChange={(e) => set("website", e.target.value)} className="input" placeholder="https://example.com" type="url" />
      </Field>

      <Field label="Contact email">
        <input value={form.email} onChange={(e) => set("email", e.target.value)} className="input" placeholder="reception@example.com" type="email" />
      </Field>

      <Field label="Notes (the agent reads these on the call)">
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="input resize-none" rows={3} placeholder="Anything that helps the agent — e.g., 'ask for Janet at the front desk' or 'they prefer text confirmation'" />
      </Field>

      {error && <p className="text-sm" style={{ color: "#9B2849" }}>{error}</p>}

      <div className="flex items-center justify-between pt-2">
        <a href="/providers" className="btn-ghost text-sm">Cancel</a>
        <button type="submit" disabled={busy || !form.name || !form.phone} className="btn-coral">
          {busy ? "Saving…" : editing ? "Save changes" : "Save provider"}
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
