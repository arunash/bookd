/** Normalize a loosely-typed phone string to E.164 (assumes US when no country code). */
export function normalizePhone(s: string): string {
  const digits = s.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}
