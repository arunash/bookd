/**
 * WhatsApp Cloud API helpers — send + parse inbound webhook.
 * Booked's own number (+1XXXXXXXXXX) — WABA pending. Once active, listens for
 * messages starting with /book or "book ".
 */
const GRAPH = "v21.0";

export async function sendWhatsAppText(phoneE164NoPlus: string, body: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const pid = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !pid) return { ok: false, error: "wa env not configured" };
  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${pid}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phoneE164NoPlus.replace(/^\+/, ""),
      type: "text",
      text: { body: body.slice(0, 1024) },
    }),
  });
  const data = await r.json().catch(() => ({}));
  const id = (data?.messages?.[0]?.id) as string | undefined;
  if (!r.ok || !id) return { ok: false, error: JSON.stringify(data).slice(0, 300) };
  return { ok: true, messageId: id };
}

export type InboundWA = { fromPhone: string; text: string; waMessageId: string; timestamp: Date };

export function parseInboundWebhook(body: unknown): InboundWA[] {
  const out: InboundWA[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown[] } })?.value?.messages ?? [];
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        const msg = m as { from?: string; id?: string; text?: { body?: string }; timestamp?: string };
        if (msg.from && msg.id && msg.text?.body) {
          out.push({
            fromPhone: msg.from.replace(/^\+/, ""),
            text: msg.text.body,
            waMessageId: msg.id,
            timestamp: msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000) : new Date(),
          });
        }
      }
    }
  }
  return out;
}

/** Decide whether Booked should handle this message (vs ignoring for Giftist). */
export function isBookedMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.startsWith("/book") || t.startsWith("book ") || t === "book";
}

/** Strip the leading "/book" or "book" prefix to get the actual request body. */
export function stripBookPrefix(text: string): string {
  return text.trim().replace(/^\/?book\s*/i, "").trim();
}
