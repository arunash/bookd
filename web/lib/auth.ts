/**
 * NextAuth wiring — Google OAuth, single-user allowlist.
 *
 * Single-user MVP: only the email in BOOKED_OWNER_EMAIL gets in. Everyone else
 * gets a generic "not authorized" page. JWT sessions, no DB table required.
 */
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const OWNER_EMAIL = (process.env.BOOKED_OWNER_EMAIL ?? "").trim().toLowerCase();

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: (process.env.GOOGLE_OAUTH_CLIENT_ID ?? "").trim(),
      clientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "").trim(),
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user }) {
      const email = (user?.email ?? "").toLowerCase();
      if (!OWNER_EMAIL) return false; // fail-closed if not configured
      return email === OWNER_EMAIL;
    },
    async session({ session, token }) {
      if (token?.email) session.user = { ...session.user, email: token.email };
      return session;
    },
  },
};
