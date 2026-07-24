/**
 * Gates every route behind a valid NextAuth session, except:
 *  - /login (the sign-in screen)
 *  - /api/auth/*  (NextAuth's own callback / signin routes)
 *  - /api/webhooks/* (Vapi + WhatsApp + signed external callbacks)
 *  - /api/cron/*  (Vercel cron, secured by CRON_SECRET in-route)
 *  - /_next/*, /favicon, /fonts/*, public assets
 *
 * Webhook + cron endpoints already authenticate themselves (signed request
 * verification or CRON_SECRET); keeping them open is required so Vapi and
 * Vercel Cron can hit us without a browser session.
 */
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/webhooks",
  "/api/cron",
  "/_next",
  "/favicon",
  "/fonts",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token?.email) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
