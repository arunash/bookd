"use client";

import { signIn } from "next-auth/react";

export default function LoginButton({ next, error }: { next?: string; error?: string }) {
  const errorMsg =
    error === "AccessDenied" ? "That email isn't allowed to sign in." :
    error ? `Sign-in error: ${error}` : null;

  return (
    <>
      <button
        onClick={() => signIn("google", { callbackUrl: next ?? "/" })}
        className="btn-coral w-full mt-6 py-3"
      >
        Continue with Google
      </button>
      {errorMsg && (
        <p className="mt-4 text-[12px]" style={{ color: "#9B2849" }}>{errorMsg}</p>
      )}
    </>
  );
}
