# Security

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report privately via
GitHub's **Security → Report a vulnerability** on this repo, or email the maintainer.
We'll acknowledge within a few days.

## Threat model

book-d is **local-first and single-user**. By default it runs on `localhost`, backed
by a local SQLite file, and only *you* (the email in `BOOKED_OWNER_EMAIL`) can sign in.
It is **not** a public multi-tenant server out of the box. Keep that in mind when
weighing risk — most web-app CVEs assume an internet-facing, multi-user deployment.

## What's hardened

- **Encryption at rest** — all PII/PHI (names, DOB, insurance IDs, card details) is
  AES-256-GCM encrypted with a per-user HKDF-derived key (`lib/crypto.ts`): fresh random
  IV per record, authenticated tag verified on decrypt. A stolen `dev.db` alone is useless.
- **Auth gate** — Google OAuth restricted to `BOOKED_OWNER_EMAIL`; **fail-closed** if that
  isn't set. All pages/APIs sit behind middleware except three intentionally-public routes.
- **Webhook & cron authentication** (the three public routes) — all now **fail-closed in
  production** and use constant-time secret comparison:
  - `/api/cron/retries` (places calls) requires `CRON_SECRET`.
  - `/api/webhooks/vapi` requires `VAPI_WEBHOOK_SECRET` (or `CRON_SECRET`).
  - `/api/webhooks/wa` verifies Meta's `X-Hub-Signature-256` HMAC with `WHATSAPP_APP_SECRET`.
  If a required secret is unset, the route refuses requests in production rather than
  processing them.
- **No dangerous sinks** — no `eval`, no `dangerouslySetInnerHTML`, no raw SQL (Prisma is
  parameterized), no server-side fetch of user-controlled URLs.

## Operating it safely

- **Never commit `.env` or `dev.db`.** They're gitignored; keep them that way.
- **Back up `ENCRYPTION_KEY`.** Losing it makes existing encrypted rows unrecoverable.
- The setup wizard generates `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, and `CRON_SECRET`.
  If you deploy publicly, set every relevant secret — the public routes fail-closed without them.
- Keep **call recording off** unless you understand your local call-recording/consent law,
  and follow the [Responsible use](./README.md#️-responsible-use--read-this) guidance.

## Dependency posture

Run `npm audit` periodically. As of the last review, residual advisories are all in
**transitive build/image/CLI dependencies** — `postcss` (build-time CSS tooling), `sharp`
(the `next/image` optimizer), and the Prisma CLI (dev-only) — for which no clean upstream
fix is yet available (npm's suggested "fix" is a nonsensical downgrade). None are reachable
by untrusted input in the default local, single-user setup:

- `postcss` advisories require processing attacker-controlled CSS **at build time** — your own code.
- `sharp`/libvips require optimizing attacker-controlled **images**; book-d does not feed
  remote/user images through `next/image`.
- Prisma CLI runs only for `generate` / `migrate` / `studio`, never at request time.

If you fork this into an internet-facing, multi-user product, treat those as real: keep
`next`, `prisma`, and their transitive deps current, re-run `npm audit`, and re-evaluate.
