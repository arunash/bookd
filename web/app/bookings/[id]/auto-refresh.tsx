"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Polls the server every 4s while the request is in flight so the UI picks
 *  up Vapi webhook updates (transcript / recording / outcome) as they land. */
export default function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 4000);
    const stop = setTimeout(() => clearInterval(t), 5 * 60 * 1000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [active, router]);
  return null;
}
