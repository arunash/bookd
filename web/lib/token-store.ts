/**
 * At-rest encryption for Integration tokens (Oura access/refresh, Whoop, etc.).
 *
 * Tokens are encrypted with the same per-user HKDF-derived key as journal
 * bodies (lib/crypto.ts) — so a leaked DB without ENCRYPTION_KEY is useless,
 * and a leaked ENCRYPTION_KEY without the DB still can't decrypt without the
 * specific row's userId.
 *
 * The Integration table's accessToken/refreshToken columns are typed as
 * String (existing schema), so we base64-encode the ciphertext. A `enc:`
 * prefix marks encrypted values so the runtime can distinguish from any
 * lingering plaintext during the migration window.
 */
import { encryptForUser, decryptForUser } from "./crypto";

const PREFIX = "enc:";

export function encryptToken(userId: string, plain: string | null | undefined): string | null {
  if (!plain) return null;
  if (plain.startsWith(PREFIX)) return plain; // already encrypted
  const buf = encryptForUser(userId, plain);
  return PREFIX + buf.toString("base64");
}

export function decryptToken(userId: string, stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext. Return as-is; caller will use it. A migration script
    // upgrades these in place.
    return stored;
  }
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
  return decryptForUser(userId, buf);
}

/** True if a stored value is in the encrypted format. */
export function isEncryptedToken(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(PREFIX);
}
