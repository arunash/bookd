/**
 * Google Calendar — OAuth dance + free/busy query + event creation.
 *
 * Setup:
 *   Cloud Console → APIs & Services → OAuth consent screen (External, "Booked")
 *   → Credentials → Create OAuth Client → Web application
 *   → Redirect URIs: https://<host>/api/integrations/google/callback (+ localhost variant)
 *   → drop client_id + client_secret into env.
 *
 * Scopes:
 *   https://www.googleapis.com/auth/calendar.readonly  (free/busy)
 *   https://www.googleapis.com/auth/calendar.events    (create events)
 */
import { decryptToken, encryptToken } from "./token-store";
import { prisma } from "./db";
import type { Integration } from "@prisma/client";

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_BASE = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/calendar/v3";

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
];

export function authorizeUrl(state: string, redirectUri: string): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_BASE}?${p.toString()}`;
}

type TokenResp = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResp> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth client creds not set");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch(TOKEN_BASE, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`token exchange failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResp> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth client creds not set");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch(TOKEN_BASE, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`token refresh failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function ensureFresh(integ: Integration): Promise<string> {
  const access = decryptToken(integ.userId, integ.accessToken);
  if (!access) throw new Error("integration has no access token");
  const exp = integ.tokenExpiresAt?.getTime();
  if (!exp || exp - Date.now() > 60 * 1000) return access;
  const refresh = decryptToken(integ.userId, integ.refreshToken);
  if (!refresh) return access;
  const t = await refreshAccessToken(refresh);
  await prisma.integration.update({
    where: { id: integ.id },
    data: {
      accessToken: encryptToken(integ.userId, t.access_token),
      tokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
    },
  });
  return t.access_token;
}

export async function getIntegration(userId: string): Promise<Integration> {
  const i = await prisma.integration.findUnique({
    where: { userId_provider: { userId, provider: "google_calendar" } },
  });
  if (!i) throw new Error("Google Calendar not connected");
  return i;
}

/** Returns free windows of ≥ minDurationMin in the user's primary calendar between start and end. */
export async function getFreeWindows(
  userId: string,
  start: Date,
  end: Date,
  minDurationMin = 30
): Promise<Array<{ start: Date; end: Date }>> {
  const integ = await getIntegration(userId);
  const access = await ensureFresh(integ);
  const r = await fetch(`${API_BASE}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: "primary" }],
    }),
  });
  if (!r.ok) throw new Error(`freeBusy failed: ${r.status} ${await r.text()}`);
  const data = (await r.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
  const busy = (data.calendars?.primary?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));

  // Compute the complement (free windows) within [start, end]
  const free: Array<{ start: Date; end: Date }> = [];
  let cursor = start;
  for (const b of busy.sort((a, b) => a.start.getTime() - b.start.getTime())) {
    if (b.start.getTime() > cursor.getTime()) free.push({ start: cursor, end: b.start });
    if (b.end.getTime() > cursor.getTime()) cursor = b.end;
  }
  if (cursor.getTime() < end.getTime()) free.push({ start: cursor, end });
  return free.filter((w) => w.end.getTime() - w.start.getTime() >= minDurationMin * 60 * 1000);
}

/** Create an event on the primary calendar. */
export async function createEvent(
  userId: string,
  args: {
    summary: string;
    description?: string;
    location?: string;
    start: Date;
    end: Date;
    timezone?: string;
  }
): Promise<{ id: string; htmlLink?: string }> {
  const integ = await getIntegration(userId);
  const access = await ensureFresh(integ);
  const r = await fetch(`${API_BASE}/calendars/primary/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: args.summary,
      description: args.description,
      location: args.location,
      start: { dateTime: args.start.toISOString(), timeZone: args.timezone ?? "America/Los_Angeles" },
      end:   { dateTime: args.end.toISOString(),   timeZone: args.timezone ?? "America/Los_Angeles" },
    }),
  });
  if (!r.ok) throw new Error(`createEvent failed: ${r.status} ${await r.text()}`);
  return r.json();
}
