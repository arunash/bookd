"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CloseOutButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function close() {
    if (busy) return;
    if (!confirm("Close this booking request out? It will be marked cancelled and removed from your active list.")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/bookings/${requestId}/cancel`, { method: "POST" });
      const json = await r.json();
      if (!r.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={close} disabled={busy} className="btn-ghost text-[11px] whitespace-nowrap" style={{ color: "#9B2849" }}>
        {busy ? "Closing…" : "Close out"}
      </button>
      {err && <span className="text-[10px]" style={{ color: "#9B2849" }}>{err}</span>}
    </div>
  );
}
