# Contributing to book-d

Thanks for your interest — book-d is a community project and PRs/issues are welcome.

## Ground rules

book-d places **real phone calls**. Any change that affects call behavior must keep the
safety defaults intact:

- The agent **discloses it's an AI** on every call — don't remove or weaken this.
- **Recording stays off by default.**
- **Minimum-necessary** disclosure of personal info; never read out card numbers.
- Nothing that enables spam, mass-calling, autodialing campaigns, or impersonation.

See the [Responsible use](./README.md#️-responsible-use--read-this) section. PRs that
undermine these will be declined.

## Dev setup

```bash
git clone https://github.com/arunash/bookd.git
cd bookd/web
npm install
npm run setup        # generates secrets, creates the local SQLite DB
npm run dev          # http://localhost:3000
```

Useful scripts (run inside `web/`):

| Command | What it does |
|---|---|
| `npm run dev` | Start the portal + agent locally |
| `npm run build` | Production build (must pass before you PR) |
| `npm run db:push` | Sync the Prisma schema to `dev.db` |
| `npm run db:studio` | Browse the local DB |
| `npm run db:seed` | Add demo providers |

Before opening a PR, please make sure:

- `npm run build` passes (this also type-checks).
- You didn't commit `.env`, `dev.db`, or any real credentials/PII.

## Testing calls safely

Never debug against a real business. **Call your own cell and role-play the receptionist.**
Set `USER_CELL_PHONE` and point a test provider's phone at your own number.

## Good first contributions

- **Voice-runtime adapters** — a thin interface so Retell / Bland work alongside Vapi.
- **Provider "playbooks"** — persist the learned phone-tree path (DTMF map, best time to
  reach a human) per provider so the next call to that office reuses it.
- **Calendar integrations** — write confirmed bookings to Google/Apple/ICS.
- **Docs & DX** — clearer setup, screenshots, troubleshooting.

## How the pieces fit

- `web/lib/vapi.ts` — the agent's prompt + call config (the "brain").
- `web/lib/booking-orchestrator.ts` — builds call context, places calls, guards retries.
- `web/app/api/cron/retries/route.ts` — the auto-retry scheduler.
- `web/prisma/schema.prisma` — local SQLite schema.

## Conduct

Be kind and constructive. This is a small project built in spare time — assume good faith.
