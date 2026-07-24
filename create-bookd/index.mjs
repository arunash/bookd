#!/usr/bin/env node
/**
 * create-bookd — scaffold a local-first AI phone-booking agent.
 *
 *   npx create-bookd my-agent
 *
 * Clones the book-d template, installs deps, and runs the setup wizard
 * (generates your encryption/session secrets + collects your Vapi keys).
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";

const REPO = "https://github.com/arunash/bookd.git";
const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const cyan = (s) => c(36, s), green = (s) => c(32, s), dim = (s) => c(2, s), bold = (s) => c(1, s), red = (s) => c(31, s);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

function has(cmd) {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}

async function main() {
  console.log(bold("\n  create-bookd") + dim(" — a personal AI phone-booking agent, running on your machine\n"));

  let target = argv[2];
  if (!target) {
    const rl = createInterface({ input: stdin, output: stdout });
    target = (await rl.question(`  Project directory ${dim("[my-bookd]")}: `)).trim() || "my-bookd";
    rl.close();
  }
  const dir = resolve(process.cwd(), target);
  if (existsSync(dir)) {
    console.error(red(`\n  ✗ ${target} already exists. Choose another name or remove it.\n`));
    exit(1);
  }
  if (!has("git")) {
    console.error(red("\n  ✗ git is required to scaffold. Install git and try again,"));
    console.error(dim(`    or download the template manually: ${REPO}\n`));
    exit(1);
  }

  console.log(dim(`\n  cloning template into ${target}/ …`));
  run("git", ["clone", "--depth", "1", REPO, dir]);
  // clean scaffolded project: drop git history + the publisher tooling
  rmSync(join(dir, ".git"), { recursive: true, force: true });
  rmSync(join(dir, "create-bookd"), { recursive: true, force: true });

  console.log(dim("\n  installing dependencies (web/) …"));
  run("npm", ["install"], { cwd: join(dir, "web") });

  console.log(dim("\n  running setup wizard …\n"));
  try {
    run("node", [join(dir, "scripts", "setup.mjs")]);
  } catch {
    console.log(cyan("\n  (setup wizard skipped — run `npm run setup` inside the project later)"));
  }

  console.log(green(`\n  ✓ Created ${target}\n`));
  console.log("  Next:");
  console.log(`    ${cyan(`cd ${target}/web && npm run dev`)}`);
  console.log(dim("    → open http://localhost:3000\n"));
  console.log(dim("  Please use responsibly — disclose it's an AI, get consent, obey call-recording/robocall law.\n"));
}

main().catch((e) => { console.error(red("\n  " + e.message + "\n")); exit(1); });
