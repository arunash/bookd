/**
 * GET /api/integrations/google/callback?code=...&state=...
 *
 * Exchanges the auth code for access + refresh tokens, encrypts them via
 * token-store, persists to Integration table, redirects back to /settings.
 */
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-calendar";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/token-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("google_state")?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.json({ error: "state mismatch" }, { status: 400 });
  }
  const userId = state.split(":")[0];
  if (!userId) return NextResponse.json({ error: "bad state" }, { status: 400 });

  const redirectUri = `${url.origin}/api/integrations/google/callback`;
  try {
    const t = await exchangeCode(code, redirectUri);
    const expiresAt = new Date(Date.now() + t.expires_in * 1000);

    await prisma.integration.upsert({
      where: { userId_provider: { userId, provider: "google_calendar" } },
      create: {
        userId,
        provider: "google_calendar",
        accessToken: encryptToken(userId, t.access_token),
        refreshToken: t.refresh_token ? encryptToken(userId, t.refresh_token) : null,
        tokenExpiresAt: expiresAt,
        scope: t.scope,
        active: true,
      },
      update: {
        accessToken: encryptToken(userId, t.access_token),
        refreshToken: t.refresh_token ? encryptToken(userId, t.refresh_token) : undefined,
        tokenExpiresAt: expiresAt,
        scope: t.scope,
        active: true,
        lastError: null,
      },
    });

    return NextResponse.redirect(new URL("/settings?google=connected", url.origin));
  } catch (e) {
    return NextResponse.redirect(new URL(`/settings?google=error&msg=${encodeURIComponent((e as Error).message)}`, url.origin));
  }
}
