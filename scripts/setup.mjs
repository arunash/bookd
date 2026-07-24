#!/usr/bin/env node
/**
 * book-d setup wizard.
 *
 *   node scripts/setup.mjs        (or: cd web && npm run setup)
 *
 * Generates your encryption/session secrets, collects your Vapi credentials,
 * writes web/.env, and initializes the local SQLite database. No cloud, no
 * account required to see the portal — you only need Vapi to place real calls.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "web");
const ENV = join(WEB, ".env");
const EXAMPLE = join(WEB, ".env.example");

const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const cyan = (s) => c(36, s), green = (s) => c(32, s), dim = (s) => c(2, s), bold = (s) => c(1, s);

async function main() {
  console.log(bold("\n  book-d — local setup\n"));
  console.log(dim("  A personal AI phone-booking agent that runs on your machine.\n"));

  if (existsSync(ENV)) {
    const rl0 = createInterface({ input: stdin, output: stdout });
    const ans = (await rl0.question(`  ${cyan("web/.env already exists.")} Overwrite? (y/N) `)).trim().toLowerCase();
    rl0.close();
    if (ans !== "y") { console.log("  Keeping existing .env. Bye."); return; }
    copyFileSync(ENV, ENV + ".bak");
    console.log(dim("  backed up to web/.env.bak"));
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (label, def = "") => {
    const suffix = def ? dim(` [${def}]`) : "";
    const v = (await rl.question(`  ${label}${suffix}: `)).trim();
    return v || def;
  };

  console.log(bold("\n  1) You\n"));
  const ownerEmail = await ask("Your email (owner / sign-in)", "you@example.com");
  const userCell = await ask("Your cell in E.164 (agent patches you in here, e.g. +14155551234)");

  console.log(bold("\n  2) Vapi — the voice runtime  " + dim("(https://vapi.ai · leave blank to explore the portal first)")));
  const vapiKey = await ask("VAPI_API_KEY");
  const vapiPhoneId = await ask("VAPI_PHONE_NUMBER_ID");

  console.log(bold("\n  3) Optional\n"));
  const anthropic = await ask("ANTHROPIC_API_KEY (parse free-text requests; optional)");
  rl.close();

  // generated secrets
  const encKey = randomBytes(32).toString("base64");   // 32 bytes -> AES-256
  const nextauth = randomBytes(32).toString("base64");
  const cronSecret = randomBytes(24).toString("hex");

  const values = {
    DATABASE_URL: "file:./dev.db",
    ENCRYPTION_KEY: encKey,
    NEXTAUTH_SECRET: nextauth,
    NEXTAUTH_URL: "http://localhost:3000",
    BOOKED_OWNER_EMAIL: ownerEmail,
    VAPI_API_KEY: vapiKey,
    VAPI_PHONE_NUMBER_ID: vapiPhoneId,
    USER_CELL_PHONE: userCell,
    ANTHROPIC_API_KEY: anthropic,
    CRON_SECRET: cronSecret,
    PUBLIC_BASE_URL: "",
  };

  // start from .env.example so all keys/comments are preserved, then fill values
  let out = existsSync(EXAMPLE) ? readFileSync(EXAMPLE, "utf8") : "";
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    const line = `${k}="${String(v).replace(/"/g, '\\"')}"`;
    out = re.test(out) ? out.replace(re, line) : out + `\n${line}`;
  }
  writeFileSync(ENV, out);
  console.log(green("\n  ✓ wrote web/.env  ") + dim("(ENCRYPTION_KEY generated — back it up; losing it makes encrypted rows unreadable)"));

  // initialize the local database
  console.log(dim("\n  initializing local SQLite database…"));
  const push = spawnSync("npx", ["prisma", "db", "push"], { cwd: WEB, stdio: "inherit", env: { ...process.env, DATABASE_URL: "file:./dev.db" } });
  if (push.status !== 0) {
    console.log(cyan("\n  (db push skipped/failed — run `cd web && npm install && npm run db:push` after installing deps)"));
  }

  console.log(bold("\n  Done. Next:\n"));
  console.log(`    ${cyan("cd web && npm run dev")}`);
  console.log(dim("    → open http://localhost:3000\n"));
  console.log(dim("    Add a provider, add yourself, then place a call. With no Vapi key you can\n    still click through the portal; add the key to dial for real.\n"));
  console.log(bold("  Please use responsibly — see README (disclose it's AI, get consent, obey call-recording/robocall law).\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
