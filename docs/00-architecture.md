# Booked — Architecture

AI phone-booking agent. Single user (Shiva). Multiple targets (therapists, doctors, restaurants, salons). Hybrid-default mode for sensitive contexts.

## Flow

```
QUEUE                  PLACE                       NAVIGATE                BRIDGE                BOOK              CAPTURE
─────                  ─────                       ────────                ──────                ────              ───────
Shiva queues a         Server picks the            Bland.ai voice agent    On human detected,    Shiva talks       Bland fires
booking via WhatsApp,  provider's mode             (system prompt =        Bland warm-transfers  to the            webhook with
web form, or iOS       (hybrid / end-to-end /      booking task + your     the call to Shiva's   receptionist      transcript +
Shortcut.              preparer). Builds a         daughter's info +       cell. Push            for ~60 sec.      outcome. We
                       task prompt + transfer      acceptable slots +      notification too.                       parse with
Booking row created    rules.                      refusal-detection                                               Claude, save
in DB. Provider        For hybrid: transfer        rules).                                                         the booked
auto-detected /        rule = on human, hand                                                                       slot to the
created.               off to Shiva's cell.        Handles phone tree                                              Booking row,
                                                   (DTMF), hold music,                                             text Shiva
                                                   voicemail (leaves                                               confirmation.
                                                   message in last
                                                   resort).
```

## Data model (full schema in `prisma/schema.prisma`)

- **User** — Shiva (single record for now, multi-user later). Stores cell phone for hybrid transfer.
- **Provider** — name, phone, website, email, online_booking_url, policy enum, notes. Insurance accepted (string array). Address. Specialty.
- **Booking** — provider, requested_slots (Json array of {start, end} preferences), mode, status (queued / dialing / on_hold / human_detected / talking / booked / failed / refused / cancelled), confirmed_slot (Json {start, end} when booked), context_for_call (e.g. daughter's name, insurance), audio_url, summary.
- **Call** — One per attempt on a Booking. bland_call_id, started_at, ended_at, duration_sec, cost, recording_url, transcript_url, outcome enum.
- **CallEvent** — Bland webhook events streamed in. call_id, event_type (call_started, transfer_initiated, human_detected, voicemail_left, ended, refused_ai), payload Json.
- **InsuranceProfile** — per-User. Carrier, member_id (encrypted), group, dob (encrypted), notes. Quote when receptionist asks.
- **Patient** — Shiva's daughter (or anyone he books for). first_name, dob (encrypted), relationship to User.

## Modes (chosen per Provider)

- **HYBRID (default for medical/therapy)** — AI navigates → transfer to user on human
- **AI_E2E** — AI handles the whole call (low-stakes provider, previously friendly)
- **PREPARER** — AI fills the online portal / drafts the email — no phone call placed

## Bland.ai integration

- POST `https://api.bland.ai/v1/calls` with `phone_number`, `task`, `voice`, `transfer_phone_number` (hybrid only), `record`, `webhook`
- Webhook URL: `/api/webhooks/bland`
- We don't use Bland's pathway builder — task prompt + transfer rule is enough
- Voicemail detection: built into Bland; configure `voicemail_message` template

## Privacy

- Daughter's name + DOB: encrypted via `lib/crypto.ts` (HKDF over `ENCRYPTION_KEY` like My Health)
- Insurance member_id + group: same
- Call recordings: stored at Bland; we reference URL only
- Call transcripts: returned as text by Bland; encrypted before persisting

## Auth

- Single user for now. Same dev-shim as My Health (`x-user-phone` header). NextAuth later.
- Bland webhook authenticated via a shared secret in the URL path or header.
