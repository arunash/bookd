#!/usr/bin/env node
/**
 * Seeds a couple of demo providers so the portal isn't empty on first run.
 * Idempotent: skips if the owner already has providers. No PII is written.
 *
 *   cd web && npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// tiny .env reader (no dotenv dependency)
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(WEB, ".env");
const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
const DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL || "file:./dev.db";
const OWNER_EMAIL = process.env.BOOKED_OWNER_EMAIL || env.BOOKED_OWNER_EMAIL || "you@example.com";

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: DATABASE_URL }) });

const DEMO_PROVIDERS = [
  { name: "Downtown Physical Therapy", serviceType: "pt", phone: "+15551234001",
    address: "100 Main St", notes: "Demo provider — replace with a real one." },
  { name: "Sunny Smiles Dental", serviceType: "dentist", phone: "+15551234002",
    address: "250 Oak Ave", notes: "Demo provider — replace with a real one." },
];

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: { email: OWNER_EMAIL, name: "Owner" },
  });
  const count = await prisma.provider.count({ where: { userId: owner.id } });
  if (count > 0) {
    console.log(`Owner already has ${count} provider(s) — skipping demo seed.`);
    return;
  }
  for (const p of DEMO_PROVIDERS) {
    await prisma.provider.create({ data: { ...p, userId: owner.id } });
    console.log(`+ ${p.name}`);
  }
  console.log("Seeded demo providers. Open the portal and try one (roleplay to your own cell first).");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
