"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-client";

/**
 * Ends the session server-side, then leaves.
 *
 * This was a `<Link href="/login">`, which is not a logout: navigating away
 * leaves `better-auth.session_token` in the browser and valid on the API, so
 * anyone with the machine — or the cookie — is still signed in. The POST is
 * what actually revokes it.
 *
 * On failure it deliberately does NOT navigate. Sending someone to /login while
 * their session is still live would show them "signed out" when they are not,
 * which is the more dangerous of the two lies on a shared workstation.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    try {
      await apiFetch("/api/auth/sign-out", { method: "POST", body: {} });
      router.replace("/login");
      // The console layout resolves the session on the server; without this it
      // would render from a cache taken while the cookie was still good.
      router.refresh();
    } catch {
      toast.error("Couldn't sign out", {
        description: "The API didn't confirm it. You are still signed in — try again.",
      });
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface-2 px-2.5 text-xs font-semibold text-fg-muted transition-colors hover:border-danger-soft-border hover:bg-danger-soft hover:text-danger-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas outline-none disabled:opacity-60"
    >
      <LogOut className="size-3.5" />
      <span className="hidden sm:inline">{pending ? "Signing out…" : "Log out"}</span>
    </button>
  );
}
