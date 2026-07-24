/**
 * Parses a freeform booking request like:
 *   "book Eliza speech therapy with Dr Cohen this Thursday or Friday between 3 and 5pm"
 *
 * Returns a structured intent we can match against the Provider directory.
 * Uses Claude (cheap + reliable for structured extraction).
 */
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

export type BookingIntent = {
  patientName?: string;          // first name or nickname
  serviceType?: "pt" | "ot" | "speech" | "doctor" | "dentist" | "therapist" | "salon" | "restaurant" | "other";
  providerNameHint?: string;     // "Dr Cohen", "Bumble & Bumble", etc.
  // Time window
  earliestStartIso?: string;
  latestStartIso?: string;
  preferredDow?: string[];       // ["tue","thu"]
  preferredHourMin?: number;     // 24h
  preferredHourMax?: number;
  urgency?: "asap" | "this_week" | "this_month" | "flexible";
  notes?: string;
};

const SYSTEM = `You parse a freeform message into a structured booking request for an AI scheduling agent. Respond with ONLY a JSON object — no preamble, no fence.

Schema:
{
  "patientName"?: string,
  "serviceType"?: "pt" | "ot" | "speech" | "doctor" | "dentist" | "therapist" | "salon" | "restaurant" | "other",
  "providerNameHint"?: string,
  "earliestStartIso"?: string,
  "latestStartIso"?: string,
  "preferredDow"?: string[],
  "preferredHourMin"?: number,
  "preferredHourMax"?: number,
  "urgency"?: "asap" | "this_week" | "this_month" | "flexible",
  "notes"?: string
}

Rules:
- patientName is the first name or nickname mentioned. Skip if not present.
- serviceType: pt=physical therapy, ot=occupational therapy, speech=speech therapy, dentist, doctor (incl pediatrician), therapist (mental health), salon, restaurant.
- providerNameHint: name of the provider/practice/doctor mentioned (e.g. "Dr Cohen", "Bumble & Bumble"). Skip if not mentioned.
- Time: convert relative expressions to absolute ISO strings using the "Current time" you're given.
- preferredDow: 3-letter lowercase day names if specified ("thursday or friday" → ["thu","fri"]).
- preferredHourMin/Max: 24h hours if a window is given (e.g. "3 to 5pm" → 15, 17).
- urgency: asap means immediately, this_week within 7 days, this_month within 30, flexible no rush.
- Skip fields the user didn't specify. Don't invent defaults.`;

export async function parseBookingIntent(text: string, nowIso: string): Promise<BookingIntent | { error: string }> {
  const resp = await anthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: SYSTEM,
    messages: [{ role: "user", content: `Current time: ${nowIso}\n\nMessage:\n${text}` }],
  });
  const block = resp.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text.trim() : "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as BookingIntent;
  } catch {
    return { error: `parse failed: ${raw.slice(0, 160)}` };
  }
}
