"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="btn-ghost text-sm whitespace-nowrap"
    >
      Sign out
    </button>
  );
}
