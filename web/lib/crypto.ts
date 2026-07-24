/**
 * Column-level encryption for PHI fields.
 *
 * Uses AES-256-GCM. The master key lives in env (`ENCRYPTION_KEY`, 32-byte
 * base64). Each user gets a deterministic derived key (HKDF over master + userId)
 * so a leaked DB without env is useless, and a leaked env without DB is useless
 * for any *specific* row.
 *
 * Round-trip:
 *   const enc = encryptForUser(userId, "headache + nausea after lunch");
 *   await prisma.journalEntry.create({ data: { bodyEnc: enc, ... } });
 *   const dec = decryptForUser(userId, row.bodyEnc);
 *
 * Don't log the plaintext. Don't store the master key in the DB.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

const IV_LEN = 12; // GCM standard
const AUTH_TAG_LEN = 16;

function masterKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY env not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  return buf;
}

function userKey(userId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(), Buffer.from(userId), Buffer.from("phi-v1"), 32));
}

export function encryptForUser(userId: string, plaintext: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", userKey(userId), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptForUser(userId: string, blob: Buffer | Uint8Array | null | undefined): string | null {
  if (!blob) return null;
  const b = Buffer.from(blob);
  const iv = b.subarray(0, IV_LEN);
  const tag = b.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ct = b.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", userKey(userId), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
