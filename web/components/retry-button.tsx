"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Confirm-then-retry control. Surfaces the original request ("what was asked")
 * in the confirm prompt so the user re-confirms the booking context before the
 * agent dials again, then POSTs to /api/bookings/[id]/retry (which enforces the
 * not-booked / in-flight / business-hours / cooldown guards server-side).
 */
export default function RetryButton({
  requestId,
  requestSummary,
  providerName,
}: {
  requestId: string;
  requestSummary: string;
  providerName?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    if (busy) return;
    const who = providerName?.trim() ? providerName.trim() : "this provider";
    const ask = requestSummary.trim();
    const ok = confirm(
      `Call ${who} again with this request?\n\n“${ask}”\n\n` +
        `The agent will redial and try to book the same thing.`
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/bookings/${requestId}/retry`, { method: "POST" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.ok) {
        setError(json.error ?? r.statusText);
        setBusy(false);
        return;
      }
      // Call is in flight — refresh so the new attempt + poller show up.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={retry}
        disabled={busy}
        className="btn-ghost text-[11px] whitespace-nowrap"
        style={{ color: "#D85B3D" }}
      >
        {busy ? "Dialing…" : "Try again"}
      </button>
      {error && <span className="text-[10px]" style={{ color: "#9B2849" }}>{error}</span>}
    </div>
  );
}
