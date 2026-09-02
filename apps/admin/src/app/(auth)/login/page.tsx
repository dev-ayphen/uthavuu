"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button, Field, Input, UthavuMark } from "@/components/ui";
import { SITE } from "@/config/site";
import { apiFetch } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { DEV_LOGINS, LOGIN_DEV_TOOLS_ENABLED } from "@/lib/env";

/**
 * Sign-in. Posts to better-auth `emailAndPassword` with `credentials: "include"`
 * (admin is cookie/session based, unlike mobile's bearer tokens), then redirects
 * to /dashboard.
 *
 * TWO THINGS FROM THE PROTOTYPE ARE DELIBERATELY ABSENT:
 *
 *  1. The "quick preset credentials" panel, which rendered
 *     `admin@uthavu.org / Admin@123` as plaintext in shipped source. No
 *     password is hardcoded anywhere in this app.
 *  2. Any client-side credential comparison, and any `?role=` in the redirect.
 *     The role comes from the session, resolved server-side. See
 *     src/lib/session.ts.
 */

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  rememberMe: z.boolean(),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  // Computed with useMemo, never assigned from a useEffect + reset. An effect
  // that resets the form on some upstream change wipes whatever the operator
  // has already typed.
  const defaultValues = useMemo<LoginValues>(
    () => ({ email: "", password: "", rememberMe: false }),
    [],
  );

  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues });

  const onSubmit = async (values: LoginValues) => {
    try {
      // `credentials: "include"` lives in apiFetch — without it the browser
      // discards the Set-Cookie on this cross-origin response and the very next
      // request looks signed out.
      await apiFetch("/api/auth/sign-in/email", {
        method: "POST",
        body: { email: values.email, password: values.password, rememberMe: values.rememberMe },
      });

      // replace(), not push() — the back button must not return to a login form
      // the operator has already passed. refresh() re-runs the console layout so
      // its server-side session lookup sees the cookie that was just set.
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.isNetworkFailure) {
        // Never "wrong password" for an outage. The operator would retype a
        // correct password repeatedly and conclude their account was broken.
        toast.error("Couldn't reach the API", {
          description: "The console is running but the API didn't answer. Check that it's up.",
        });
        return;
      }

      if (error instanceof ApiError && error.code === "INVALID_EMAIL_OR_PASSWORD") {
        // Attached to the form, not one field: the API deliberately does not
        // say which half was wrong, and guessing "password" would be a lie that
        // also leaks whether the email exists.
        setError("root", { message: "That email and password don't match an admin account." });
        return;
      }

      setError("root", {
        message: error instanceof Error ? error.message : "Sign-in failed. Try again.",
      });
    }
  };

  return (
    <div className="relative min-h-svh overflow-hidden">
      {/* Full-bleed hero. `priority` because it is the LCP element. */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/hero-community.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/70 to-canvas/60" />
      </div>

      <div className="mx-auto flex min-h-svh w-full max-w-[var(--container-default)] flex-col justify-between gap-10 px-6 py-6 sm:px-10 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-panel bg-primary text-primary-fg shadow-raised">
              <UthavuMark className="size-6" />
            </span>
            <span>
              <span className="block text-2xl leading-none font-extrabold tracking-tight text-fg">
                {SITE.wordmarkTamil}
              </span>
              <span className="micro-label mt-1 block text-primary">Uthavu Platform</span>
            </span>
          </div>
          <Link
            href={SITE.publicSiteUrl}
            className="rounded-control border border-border bg-surface/70 px-3 py-2 text-xs font-semibold text-fg-muted backdrop-blur-md transition-colors hover:border-primary hover:text-fg"
          >
            ← Public website
          </Link>
        </header>

        <main className="grid flex-1 items-center gap-10 lg:grid-cols-12">
          <section className="space-y-6 lg:col-span-7">
            <span className="inline-block rounded-pill border border-primary-soft-border bg-primary-soft px-3.5 py-1.5 text-xs font-bold text-primary-soft-fg backdrop-blur-md">
              Admin operations console
            </span>

            <h1 className="text-4xl leading-tight font-extrabold tracking-tight text-fg sm:text-5xl">
              உதவி கேட்கும் குரல்,
              <br />
              <span className="font-[family-name:var(--font-tamil-display)] text-primary">
                அடுத்த நிமிடமே உதவுவோம்.
              </span>
            </h1>

            <p className="max-w-xl text-sm leading-relaxed text-fg-muted">
              Tamil Nadu&apos;s community emergency and help network. Monitor live requests, manage
              verified volunteers, review impact stories, and keep response times short.
            </p>

          </section>

          <section className="lg:col-span-5">
            <div className="rounded-panel border border-border bg-surface/90 p-6 shadow-popover backdrop-blur-xl sm:p-7">
              <h2 className="text-xl font-extrabold tracking-tight text-fg">
                Sign in to the console
              </h2>
              <p className="mt-1 text-xs text-fg-subtle">
                Use your operator account. Access is granted by a super admin.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
                {/* Form-level failure (bad credentials, an unexpected status).
                    role="alert" so it is announced — an operator using a screen
                    reader would otherwise get no feedback at all on a failed
                    sign-in, since focus stays where it was. */}
                {errors.root?.message ? (
                  <p
                    role="alert"
                    className="rounded-panel border border-danger-soft-border bg-danger-soft px-3 py-2 text-sm text-danger-fg"
                  >
                    {errors.root.message}
                  </p>
                ) : null}

                <Field label="Admin email" htmlFor="email" error={errors.email?.message}>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@uthavu.org"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    {...register("email")}
                  />
                </Field>

                <Field label="Password" htmlFor="password" error={errors.password?.message}>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    {...register("password")}
                  />
                </Field>

                <div className="flex items-center justify-between gap-3 text-xs">
                  <label className="flex cursor-pointer items-center gap-2 text-fg-muted select-none">
                    <input
                      type="checkbox"
                      className="size-3.5 rounded-sm accent-[var(--primary)]"
                      {...register("rememberMe")}
                    />
                    Remember me
                  </label>
                  {/* Not a link. `POST /api/auth/forget-password` returns 400
                      RESET_PASSWORD_DISABLED unconditionally — there is no email
                      provider (ADR 0003), so self-service reset cannot work. A
                      link here would look actionable and silently fail. */}
                  <span className="text-fg-muted" title="Ask a super admin to rotate it with SEED_ADMIN_FORCE_PASSWORD_RESET=true pnpm db:seed">
                    Password reset is manual
                  </span>
                </div>

                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Signing in…" : "Sign in to console"}
                  {!isSubmitting ? <ArrowRight /> : null}
                </Button>
              </form>

              {/*
                The prototype's replacement. This renders only when a developer
                opts in via env AND the build is non-production — the condition
                is statically false in a production build, so the markup is
                eliminated rather than merely hidden. It shows no credentials:
                the whole point is that they live in the developer's own
                environment, never in this repository.
              */}
              {LOGIN_DEV_TOOLS_ENABLED && DEV_LOGINS.length > 0 ? (
                <div className="mt-5 rounded-control border border-warning-soft-border bg-warning-soft p-3">
                  <p className="text-[11px] text-warning-fg">
                    <strong className="font-bold">Dev mode.</strong> Accounts seeded by{" "}
                    <code className="font-mono">pnpm db:seed</code>. These come from your local
                    <code className="font-mono"> .env.local</code> — no password is stored in this
                    repository.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {DEV_LOGINS.map((account) => (
                      <button
                        key={account.email}
                        type="button"
                        onClick={() => {
                          // Fill only — never auto-submit. An accidental click
                          // should not sign someone in as a super admin.
                          setValue("email", account.email, { shouldValidate: true });
                          setValue("password", account.password, { shouldValidate: true });
                        }}
                        className="rounded-control border border-warning-soft-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-fg transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring outline-none"
                      >
                        Fill {account.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </main>

        <footer className="border-t border-border pt-4 text-center text-[11px] text-fg-subtle">
          © {new Date().getFullYear()} Uthavu · Admin command &amp; moderation console
        </footer>
      </div>
    </div>
  );
}
