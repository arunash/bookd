/**
 * Chat-flow draft endpoint.
 *
 * Client posts the conversation so far + the running draft. Claude turns the
 * conversation into structured booking fields (person, provider, window, notes)
 * and decides when the draft is ready to confirm. When ready, we also include
 * a preview of what the agent will say on the call.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { decryptForUser } from "@/lib/crypto";

export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Draft = {
  personId?: string;
  providerId?: string;
  serviceTypeHint?: string;
  requestSummary?: string;
  desiredWindowSummary?: string;
  earliestStartIso?: string;
  latestStartIso?: string;
  preferredDow?: string[];
  preferredHourMin?: number;
  preferredHourMax?: number;
  notes?: string;
};

type Payload = {
  messages: ChatMessage[];
  draft?: Draft;
};

const SYSTEM = (now: string, people: string, providers: string) => `You are the book-d concierge — collecting details so an AI voice agent can place a phone call on the user's behalf.

Current time: ${now}

# People the user can book for (use their id):
${people}

# Providers the user has saved (use their id when picking one):
${providers}

# Your job
Have a short, friendly back-and-forth that gathers exactly three things:
1. **Who the call is for** — pick a personId from the list above. If only one person is listed and it's obvious, just confirm.
2. **What the appointment is for** — the service (PT, therapy follow-up, dentist, eval, etc.), any relevant context, and the desired time window.
3. **Which provider to call** — pick a providerId from the list. If they describe a provider that isn't in the list, surface that they should add it first via /providers/new.

# Rules
- Be terse. One question at a time. Don't list every detail back.
- If the user's first message already contains all three, skip ahead to confirmation.
- NEVER invent a personId or providerId — only use the ids shown above.
- For times: convert relative phrases ("next Wednesday afternoon") to ISO if you can; otherwise just keep the human phrasing in desiredWindowSummary.
- The voice agent already has insurance, DOB, and patient name from the person record — don't ask the user about those.
- Set ready=true ONLY when personId + providerId + requestSummary + desiredWindowSummary are all set AND the user has explicitly or implicitly confirmed. When ready, your "message" should ask "Want me to call now?" (or equivalent) and you should include a callScript preview.
- The callScript preview MUST start with "Hi — is this [Provider Name]?" because book-d always confirms the provider before delivering the booking ask. Then in 1–2 sentences, summarize what the agent will say once the receptionist confirms — the agent speaks like a normal booking assistant ("Hi, I'm a booking assistant calling on behalf of [Booker]. I'd like to schedule a [service] for [his daughter / his son / etc.] [Patient] [for window]. Do you have any availability?"). Do NOT include HIPAA disclosures, insurance details, or "I'm reaching out to get booking details" in the preview.
- ALWAYS respond by calling the respond tool. Never reply in plain text.`;

// Schema enforced via tool use — guarantees structurally valid output.
const RESPOND_TOOL = {
  name: "respond",
  description: "Reply to the user and update the booking draft. Every turn must call this tool exactly once.",
  input_schema: {
    type: "object" as const,
    properties: {
      message: {
        type: "string",
        description: "Warm, brief reply (≤ 2 sentences) shown to the user.",
      },
      draft: {
        type: "object",
        description: "Patch applied to the booking draft. Only include fields you are updating.",
        properties: {
          personId: { type: "string" },
          providerId: { type: "string" },
          serviceTypeHint: {
            type: "string",
            enum: ["pt", "ot", "speech", "doctor", "dentist", "therapist", "salon", "restaurant", "other"],
          },
          requestSummary: { type: "string" },
          desiredWindowSummary: { type: "string" },
          earliestStartIso: { type: "string" },
          latestStartIso: { type: "string" },
          preferredDow: { type: "array", items: { type: "string" } },
          preferredHourMin: { type: "integer", minimum: 0, maximum: 23 },
          preferredHourMax: { type: "integer", minimum: 0, maximum: 23 },
          notes: { type: "string" },
        },
      },
      ready: {
        type: "boolean",
        description: "True only when person, provider, request, and window are all set and the user has confirmed.",
      },
      callScript: {
        type: "string",
        description: "Required when ready=true. 2-3 sentence preview of what the voice agent will say.",
      },
    },
    required: ["message", "draft", "ready"],
  },
};

type ToolInput = {
  message?: string;
  draft?: Draft;
  ready?: boolean;
  callScript?: string;
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  const body = (await req.json().catch(() => null)) as Payload | null;
  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages[] required" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 401 });

  const [peopleRows, providerRows] = await Promise.all([
    prisma.person.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.provider.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
  ]);

  const people = peopleRows.map((p) => {
    const first = decryptForUser(user.id, new Uint8Array(p.firstNameEnc)) ?? "(name unavailable)";
    return `- id=${p.id}  ${first} (${p.relationship})`;
  }).join("\n") || "  (none — user has no saved people)";

  const providers = providerRows.map((p) => {
    return `- id=${p.id}  ${p.name} — ${p.serviceType.toUpperCase()} · ${p.phone}${p.policy === "online_only" ? " (online_only)" : ""}`;
  }).join("\n") || "  (none — user has no saved providers)";

  const anthropic = new Anthropic({ apiKey });
  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM(new Date().toISOString(), people, providers),
    tools: [RESPOND_TOOL],
    tool_choice: { type: "tool", name: "respond" },
    messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const toolBlock = resp.content.find((b) => b.type === "tool_use" && b.name === "respond");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return NextResponse.json({
      message: "Sorry — the agent skipped its tool call. Try saying that again?",
      draft: body.draft ?? {},
      ready: false,
    });
  }
  const out = toolBlock.input as ToolInput;

  // Sanity-strip hallucinated ids.
  const validPersonIds = new Set(peopleRows.map((p) => p.id));
  const validProviderIds = new Set(providerRows.map((p) => p.id));
  const patch = { ...(out.draft ?? {}) };
  if (patch.personId && !validPersonIds.has(patch.personId)) delete patch.personId;
  if (patch.providerId && !validProviderIds.has(patch.providerId)) delete patch.providerId;

  const next: Draft = { ...(body.draft ?? {}), ...patch };

  // Don't allow ready=true unless the merged draft has the four required fields.
  const ready = !!out.ready && !!next.personId && !!next.providerId && !!next.requestSummary && !!next.desiredWindowSummary;

  return NextResponse.json({
    message: out.message ?? "…",
    draft: next,
    ready,
    callScript: ready ? out.callScript : undefined,
  });
}
