/**
 * Client-visible configuration.
 *
 * Anything read here is inlined into the browser bundle at build time, so it
 * must never hold a secret. Server-only values belong in a server module.
 */

/** Base URL of the Uthavu API. Admin talks to it with session cookies. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Dev-only login affordances (e.g. a "fill a test account" button).
 *
 * Two independent locks, both of which must open:
 *   1. `process.env.NODE_ENV !== "production"` — statically false in a
 *      production build, so the guarded branch is dead-code-eliminated and the
 *      markup cannot ship at all.
 *   2. an explicit opt-in env var — off unless someone deliberately sets it.
 *
 * This exists because the prototype rendered real credentials as plaintext on
 * the login page. No password is ever hardcoded in this repo; whatever a dev
 * tool fills comes from the developer's own env, never from source.
 */
export const LOGIN_DEV_TOOLS_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_ENABLE_LOGIN_DEV_TOOLS === "true";

/**
 * Dev-only credential quick-fill for the login page.
 *
 * Read from the developer's own gitignored `.env.local`, never from source —
 * the prototype hardcoded `admin@uthavu.org / Admin@123` into a shipped file,
 * which is the thing this arrangement exists to avoid. An empty entry simply
 * renders no button, so a developer who has not set these sees nothing broken.
 *
 * Values are inlined into the browser bundle at build time, which is exactly
 * why LOGIN_DEV_TOOLS_ENABLED also gates on NODE_ENV !== "production": in a
 * production build the guarded branch is statically dead and eliminated, so
 * these can never reach a real user even if the vars are set.
 */
export const DEV_LOGINS: { label: string; email: string; password: string }[] = [
  {
    label: "Super Admin",
    email: process.env.NEXT_PUBLIC_DEV_SUPER_EMAIL ?? "",
    password: process.env.NEXT_PUBLIC_DEV_SUPER_PASSWORD ?? "",
  },
  {
    label: "Ops Admin",
    email: process.env.NEXT_PUBLIC_DEV_OPS_EMAIL ?? "",
    password: process.env.NEXT_PUBLIC_DEV_OPS_PASSWORD ?? "",
  },
].filter((entry) => entry.email && entry.password);
