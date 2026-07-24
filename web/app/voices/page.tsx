import { Shell } from "@/components/shell";
import VoiceLab from "./voice-lab";

export const dynamic = "force-dynamic";

// Curated from the current ElevenLabs default voice library (the set enabled by
// default on every account) — females first, since the medical-booking default
// wants a calm, reassuring female. Legacy/community IDs (Grace/Nicole/Serena) and
// the un-tunable Vapi "sarah" alias were dropped; real Sarah + Jessica/Laura/
// River/George added. Refreshed 2026-06-16.
const VOICES: { id: string; name: string; vibe: string; voiceId: string }[] = [
  { id: "sarah",     name: "Sarah",     vibe: "mature, reassuring female (current default)", voiceId: "EXAVITQu4vr4xnSDxMaL" },
  { id: "rachel",    name: "Rachel",    vibe: "warm, professional female",           voiceId: "21m00Tcm4TlvDq8ikWAM" },
  { id: "matilda",   name: "Matilda",   vibe: "warm, friendly American female",      voiceId: "XrExE9yKIg1WjnnlVkGX" },
  { id: "lily",      name: "Lily",      vibe: "warm, conversational female",         voiceId: "pFZP5JQG7iQjIQuC4Bku" },
  { id: "jessica",   name: "Jessica",   vibe: "expressive, conversational female",   voiceId: "cgSgspJ2msm6clMCkdW9" },
  { id: "laura",     name: "Laura",     vibe: "upbeat, young American female",       voiceId: "FGY2WhTYpPnrIDTdsKH5" },
  { id: "alice",     name: "Alice",     vibe: "confident, British female",           voiceId: "Xb7hH8MSUJpSbSDYk0k2" },
  { id: "charlotte", name: "Charlotte", vibe: "young, articulate female",            voiceId: "XB0fDUnXU5powFXDhCwa" },
  { id: "aria",      name: "Aria",      vibe: "expressive, mid-range female",        voiceId: "9BWtsMINqrJLrRacOk9x" },
  { id: "river",     name: "River",     vibe: "calm, neutral / non-binary",          voiceId: "SAz9YHcvj6GT2YYXdXww" },
  { id: "brian",     name: "Brian",     vibe: "deep, friendly American male",        voiceId: "nPczCjzI2devNBz1zQrb" },
  { id: "george",    name: "George",    vibe: "warm, mature British male",           voiceId: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "daniel",    name: "Daniel",    vibe: "authoritative British male",          voiceId: "onwK4e9ZLuTAKqWW03F9" },
];

export default function VoicesPage() {
  return (
    <Shell narrow>
      <header className="pt-12 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">Voice lab</p>
        <h1 className="font-serif text-5xl text-ink mt-2">Try a voice.</h1>
        <p className="text-ink-2 mt-3 text-base leading-relaxed">
          Each button places a short demo call to your cell ({process.env.USER_CELL_PHONE ?? "set USER_CELL_PHONE"}) using
          the chosen ElevenLabs voice. Adjust speed + sample text inline. Set the favorite as default once you pick one.
        </p>
      </header>
      <VoiceLab voices={VOICES} cell={process.env.USER_CELL_PHONE ?? null} />
    </Shell>
  );
}
