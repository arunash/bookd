/**
 * Claude-based call-outcome classifier.
 *
 * Takes a Vapi-transcribed phone call between book-d and a medical/salon/etc.
 * receptionist, returns a structured outcome + a 1–2 sentence human summary
 * suitable for the home dashboard card. Mirrors scripts/poll_call.py so the
 * webhook and the offline poller produce the same shape.
 */
import Anthropic from "@anthropic-ai/sdk";

export type CallOutcome =
  | "booked"
  | "patched_then_booked"
  | "voicemail_left"
  | "voicemail_no_message"
  | "no_answer"
  | "busy"
  | "refused_by_provider"
  | "not_accepting_patients"
  | "hung_up"
  | "error"
  | "needs_retry"
  | "unknown";

export type Classification = {
  outcome: CallOutcome;
  summary: string;                  // ≤ 200 chars, readable.
  nextAction?: string;              // optional follow-up note.
  confirmedSlotIso?: string;        // when outcome is booked or patched_then_booked.
  confirmationNumber?: string;
  prepInstructions?: string;
};

const SYSTEM = `You analyze a phone-call transcript between an AI scheduling assistant (named book-d) and a receptionist. Respond with ONLY a JSON object — no preamble, no fence — matching this schema:

{
  "outcome": "booked" | "patched_then_booked" | "voicemail_left" | "voicemail_no_message" | "refused_by_provider" | "not_accepting_patients" | "no_answer" | "busy" | "hung_up" | "needs_retry",
  "confirmed_slot_iso"?: string,
  "confirmation_number"?: string,
  "prep_instructions"?: string,
  "summary": string,
  "next_action"?: string
}

Rules:
- 'patched_then_booked' only when the receptionist refused the AI AND the call was transferred to the parent AND a slot was confirmed on the patched call.
- 'voicemail_left' when an answering machine picked up AND book-d left a message.
- 'voicemail_no_message' when an answering machine picked up AND book-d hung up silently.
- 'refused_by_provider' when the receptionist declined to schedule *with the AI specifically* (wanted a human / doesn't take AI calls) and no transfer happened.
- 'not_accepting_patients' when the office can't take this patient at all — not accepting new patients, wrong specialty, or doesn't take the insurance at all — and no booking was made. This is distinct from refusing the AI; the agent thanked them and hung up.
- 'no_answer' when no one picked up at all and there was no voicemail. This INCLUDES calls where the only thing said was the assistant greeting / "Hello? Is anyone there?" with no human ever responding (typically ends with a silence timeout) — treat that as 'no_answer', not 'needs_retry'.
- 'busy' when the line was busy.
- 'hung_up' when one side ended the call early.
- 'needs_retry' as a catch-all when none of the above clearly applies.
- An "Ended reason:" line may be appended to the transcript (Vapi's call-end code). Use it as a tie-breaker: 'silence-timed-out' with no human speech → 'no_answer'; 'customer-busy' → 'busy'; a transfer reason ('assistant-forwarded-call') means the call was patched to the parent.
- 'summary' must be ≤ 200 chars and read like a text-message update. Lead with who said what, e.g. "Receptionist took the request and confirmed Wed 6/18 at 2pm." or "Voicemail picked up; left a callback message."`;

export async function classifyCall(transcript: string, fallbackEndedReason?: string): Promise<Classification> {
  if (!transcript.trim()) {
    // No transcript at all → infer from the Vapi end reason rather than always
    // guessing no_answer (busy / voicemail / error read very differently).
    const r = fallbackEndedReason ?? "";
    const outcome: CallOutcome =
      /busy/.test(r) ? "busy"
      : /voicemail/.test(r) ? "voicemail_no_message"
      : /error|failed/.test(r) ? "error"
      : "no_answer";
    return {
      outcome,
      summary: fallbackEndedReason ? `Call ended without a transcript (${fallbackEndedReason}).` : "Call ended without a transcript.",
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { outcome: "unknown", summary: "Classifier unavailable (no ANTHROPIC_API_KEY)." };
  }

  const anthropic = new Anthropic({ apiKey });
  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: "user", content: transcript.slice(0, 8000) + (fallbackEndedReason ? `\n\nEnded reason: ${fallbackEndedReason}` : "") }],
    });
    const block = resp.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as {
      outcome?: CallOutcome;
      summary?: string;
      next_action?: string;
      confirmed_slot_iso?: string;
      confirmation_number?: string;
      prep_instructions?: string;
    };
    return {
      outcome: parsed.outcome ?? "needs_retry",
      summary: (parsed.summary ?? "Call completed.").slice(0, 400),
      nextAction: parsed.next_action,
      confirmedSlotIso: parsed.confirmed_slot_iso,
      confirmationNumber: parsed.confirmation_number,
      prepInstructions: parsed.prep_instructions,
    };
  } catch (e) {
    return { outcome: "needs_retry", summary: `Classifier failed: ${(e as Error).message.slice(0, 120)}` };
  }
}
