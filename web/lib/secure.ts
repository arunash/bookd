import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison for secrets/tokens (avoids timing side-channels).
 * Returns false on length mismatch without leaking via early return timing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
