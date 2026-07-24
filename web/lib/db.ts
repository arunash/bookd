import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

// Local-first: SQLite via the better-sqlite3 driver adapter. The whole datastore
// is one file on your machine (DATABASE_URL="file:./dev.db"). No cloud DB.
function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (expected e.g. file:./dev.db)");
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalThis.prismaGlobal ?? makeClient();
if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;
