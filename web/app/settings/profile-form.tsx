"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "UTC",
];

export default function ProfileForm({ initial }: { initial: { name: string; timezone: string } }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [timezone, setTimezone] = useState(initial.timezone || "America/Los_Angeles");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, timezone }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      setMsg("Saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="block">
        <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-1.5">Your name (the agent says this)</div>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Shiva Arunachalam" />
      </label>
      <label className="block">
        <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-1.5">Timezone</div>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input">
          {TIMEZONES.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn-coral text-sm">{busy ? "Saving…" : "Save profile"}</button>
        {msg && <span className="text-[12px]" style={{ color: "#2F7A5A" }}>{msg}</span>}
        {err && <span className="text-[12px]" style={{ color: "#9B2849" }}>{err}</span>}
      </div>
    </form>
  );
}
