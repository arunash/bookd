/**
 * GET /api/integrations/google/connect
 * Kicks off Google Calendar OAuth. Single-user MVP — we resolve the user from
 * the only User row in the DB (no NextAuth yet).
 *
 * Pattern: random state cookie, redirects to Google's authorize endpoint with
 * the calendar scopes. Callback exchanges the code + persists encrypted tokens.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/google-calendar";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) return NextResponse.json({ error: "no user — visit /people first" }, { status: 401 });

  const nonce = randomBytes(12).toString("base64url");
  const state = `${user.id}:${nonce}`;
  const redirectUri = `${new URL(req.url).origin}/api/integrations/google/callback`;

  try {
    const url = authorizeUrl(state, redirectUri);
    const res = NextResponse.redirect(url);
    res.cookies.set("google_state", state, {
      httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/",
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
