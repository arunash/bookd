"use client";

import { useState } from "react";

type Voice = { id: string; name: string; vibe: string; voiceId: string };

const DEFAULT_SAMPLE =
  "Hi — is this Pinnacle Kidz Pediatric Physical Therapy? " +
  "I'm calling on behalf of Shiva Arunachalam to get booking details for Aadhya Shiva's physical therapy appointment next week. " +
  "I am HIPAA compliant.";

export default function VoiceLab({ voices, cell }: { voices: Voice[]; cell: string | null }) {
  const [speed, setSpeed] = useState(0.89);
  const [model, setModel] = useState<"eleven_flash_v2_5" | "eleven_turbo_v2_5" | "eleven_multilingual_v2" | "eleven_v3">("eleven_turbo_v2_5");
  const [sample, setSample] = useState(DEFAULT_SAMPLE);
  const [customVoiceId, setCustomVoiceId] = useState("");
  const [status, setStatus] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  async function call(voiceId: string, voiceLabel: string) {
    setPending(voiceLabel);
    setStatus((s) => ({ ...s, [voiceLabel]: "Dialing…" }));
    try {
      const r = await fetch("/api/voices/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId, voiceModel: model, speed, sampleText: sample, voiceLabel }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setStatus((s) => ({ ...s, [voiceLabel]: `❌ ${json.error ?? r.statusText}` }));
      } else {
        setStatus((s) => ({ ...s, [voiceLabel]: `📞 Ringing ${json.dialedTo}` }));
      }
    } catch (e) {
      setStatus((s) => ({ ...s, [voiceLabel]: `❌ ${e instanceof Error ? e.message : String(e)}` }));
    } finally {
      setPending(null);
    }
  }

  if (!cell) {
    return (
      <div className="card p-6 mt-4 text-sm" style={{ color: "#9B2849", background: "rgba(215,64,107,0.06)" }}>
        Set <code className="font-mono">USER_CELL_PHONE</code> in env (E.164) so the lab knows where to dial.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      <section className="card p-5">
        <h2 className="font-serif text-2xl text-ink">Test parameters</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={`Speed (${speed.toFixed(2)})`}>
            <input
              type="range" min={0.7} max={1.2} step={0.01}
              value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
            <div className="flex justify-between text-[10px] text-ink-3 mt-0.5 font-mono">
              <span>0.70</span><span>0.89</span><span>1.20</span>
            </div>
          </Field>
          <Field label="ElevenLabs model">
            <select value={model} onChange={(e) => setModel(e.target.value as typeof model)} className="input">
              <option value="eleven_flash_v2_5">eleven_flash_v2_5 (~75ms, best for agents)</option>
              <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 (current default)</option>
              <option value="eleven_multilingual_v2">eleven_multilingual_v2</option>
              <option value="eleven_v3">eleven_v3 (most expressive, higher latency)</option>
            </select>
          </Field>
        </div>
        <Field label="Sample text (the AI says this then ends)">
          <textarea
            value={sample} onChange={(e) => setSample(e.target.value)}
            rows={3} className="input w-full font-sans"
          />
        </Field>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-2xl text-ink">Built-in voices</h2>
        <p className="text-[12px] text-ink-3 mt-1">
          Some voice IDs may not be enabled on this Vapi account — Vapi will error with <code>eleven-labs-voice-failed</code> if so.
        </p>
        <ul className="mt-3 divide-y divide-rule">
          {voices.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-ink font-medium text-sm">{v.name} <span className="text-ink-3">— {v.vibe}</span></p>
                <p className="text-[11px] text-ink-3 font-mono truncate">{v.voiceId}</p>
                {status[v.name] && <p className="text-[12px] mt-0.5" style={{ color: status[v.name].startsWith("❌") ? "#9B2849" : "#2F7A5A" }}>{status[v.name]}</p>}
              </div>
              <button
                onClick={() => call(v.voiceId, v.name)}
                disabled={pending === v.name}
                className="btn-coral whitespace-nowrap text-sm"
              >
                {pending === v.name ? "Dialing…" : "Call me"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-2xl text-ink">Custom voice ID</h2>
        <p className="text-[12px] text-ink-3 mt-1">Paste any ElevenLabs voice ID (from <a className="text-[#D85B3D] hover:underline" target="_blank" href="https://elevenlabs.io/app/voice-library">elevenlabs.io/app/voice-library</a>).</p>
        <div className="mt-3 flex gap-2">
          <input
            value={customVoiceId} onChange={(e) => setCustomVoiceId(e.target.value)}
            placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
            className="input font-mono flex-1"
          />
          <button
            onClick={() => customVoiceId.length >= 8 && call(customVoiceId.trim(), `Custom (${customVoiceId.slice(0, 6)}…)`)}
            disabled={!customVoiceId || pending !== null}
            className="btn-coral whitespace-nowrap"
          >
            Call me
          </button>
        </div>
        {status[`Custom (${customVoiceId.slice(0, 6)}…)`] && (
          <p className="text-[12px] mt-2" style={{ color: status[`Custom (${customVoiceId.slice(0, 6)}…)`].startsWith("❌") ? "#9B2849" : "#2F7A5A" }}>
            {status[`Custom (${customVoiceId.slice(0, 6)}…)`]}
          </p>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mt-4 first:mt-0">
      <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-1.5">{label}</div>
      {children}
    </label>
  );
}
