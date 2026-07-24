# create-bookd

Scaffold a **local-first personal AI phone-booking agent** ([book-d](https://github.com/arunash/bookd)) in one command.

```bash
npx create-bookd my-agent
```

It clones the template, installs dependencies, and runs the setup wizard —
which generates your encryption/session secrets and collects your
[Vapi](https://vapi.ai) credentials. Then:

```bash
cd my-agent/web && npm run dev   # portal at http://localhost:3000
```

- **Local-first** — your data lives in a single SQLite file; PII/PHI encrypted at rest.
- **No tunnel required** — call outcomes are polled from Vapi, so there's no webhook/ngrok step.
- You bring your own Vapi + telephony keys (billed to you); the code is free (MIT).

> ⚠️ Places real phone calls. Use responsibly: disclose it's an AI, get consent, and obey
> call-recording / robocall law in your jurisdiction. See the main repo's README.

Requires Node 18+ and git.
