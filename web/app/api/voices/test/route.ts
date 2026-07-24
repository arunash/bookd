/**
 * Voice-lab endpoint: places a short demo call to USER_CELL_PHONE so you can
 * compare ElevenLabs voices live. No DB writes, no orchestrator hooks — direct
 * Vapi call with whatever voice config the client posts.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  voiceId: z.string().min(4).max(80),
  voiceModel: z.enum(["eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_v3"]).default("eleven_turbo_v2_5"),
  speed: z.number().min(0.7).max(1.2).default(0.9),
  sampleText: z.string().min(1).max(800).optional(),
  voiceLabel: z.string().max(60).optional(),
});

const DEFAULT_SAMPLE = (label?: string) =>
  `Hi. This is book-d${label ? ` testing the ${label} voice` : ""}. ` +
  "I'm reaching out to get booking details for Aadhya Shiva's physical therapy appointment next week. " +
  "I am HIPAA compliant.";

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  }
  const { voiceId, voiceModel, speed, sampleText, voiceLabel } = parsed.data;

  const apiKey = process.env.VAPI_API_KEY;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  const cell = (process.env.USER_CELL_PHONE ?? "").trim();
  if (!apiKey || !phoneNumberId || !cell) {
    return NextResponse.json({ error: "VAPI_API_KEY / VAPI_PHONE_NUMBER_ID / USER_CELL_PHONE not set" }, { status: 500 });
  }

  const intro = sampleText ?? DEFAULT_SAMPLE(voiceLabel);

  const body = {
    customer: { number: cell, name: "Voice lab test" },
    phoneNumberId,
    assistant: {
      model: {
        provider: "openai",
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are running a voice-lab demo. Speak the firstMessage exactly as given, then briefly thank the listener and end the call. Keep total length under 25 seconds.",
          },
        ],
      },
      voice: { provider: "11labs", voiceId, model: voiceModel, speed },
      firstMessage: intro,
      firstMessageMode: "assistant-speaks-first",
      endCallMessage: "That's the sample. Thanks.",
      endCallPhrases: ["thanks", "goodbye"],
      recordingEnabled: false,
      silenceTimeoutSeconds: 8,
      maxDurationSeconds: 40,
      backgroundSound: "off",
      transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
    },
    metadata: { kind: "voice-lab", voiceId, voiceLabel },
  };

  const r = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    return NextResponse.json({ ok: false, status: r.status, error: text.slice(0, 600) }, { status: 502 });
  }
  let parsedJson: unknown = null;
  try { parsedJson = JSON.parse(text); } catch {}
  const id = parsedJson && typeof parsedJson === "object" && "id" in parsedJson
    ? (parsedJson as { id: string }).id
    : undefined;
  return NextResponse.json({ ok: true, callId: id, dialedTo: cell });
}
