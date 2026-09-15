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
    <div className="relative min-h-svh overflow-hidden bg-slate-950">
      {/* Bright & Clear Background Hero Image */}
      <div className="absolute inset-0 pointer-events-none">
        <Image
          src="/hero-community.jpg"
          alt="Tamil Nadu Community"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[15%_center] brightness-105 contrast-105"
        />
        {/* Soft, light vignette overlay to keep image bright while preserving text readability */}
        <div className="absolute inset-0 bg-linear-to-r from-slate-950/40 via-transparent to-slate-950/60" />
        <div className="absolute inset-0 bg-linear-to-t from-slate-950/50 via-transparent to-slate-950/30" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-(--container-default) flex-col justify-between gap-10 px-6 py-6 sm:px-10 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-panel bg-[#16a34a] text-white shadow-raised">
              <UthavuMark className="size-6" />
            </span>
            <span>
              <span className="block text-2xl leading-none font-extrabold tracking-tight text-white">
                {SITE.wordmarkTamil}
              </span>
              <span className="micro-label mt-1 block text-[#22c55e]">UTHAVU PLATFORM</span>
            </span>
          </div>
          <Link
            href={SITE.publicSiteUrl}
            className="rounded-full border border-white/20 bg-slate-900/60 px-4 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-slate-800 hover:text-white"
          >
            ← Public Website
          </Link>
        </header>

        <main className="grid flex-1 items-center gap-10 lg:grid-cols-12 pt-6 sm:pt-12">
          <section className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#22c55e]/40 bg-slate-950/80 px-3.5 py-1.5 text-xs font-bold text-[#22c55e] backdrop-blur-md shadow-md">
              <span>🌟</span> Admin Operations Console
            </div>

            <h1 className="text-4xl leading-tight font-extrabold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] sm:text-5xl">
              உதவி கேட்கும் குரல்,
              <br />
              <span className="font-tamil-display text-[#22c55e] drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                அடுத்த நிமிடமே உதவுவோம்.
              </span>
            </h1>

            <p className="max-w-xl text-sm leading-relaxed text-slate-100 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] font-medium rounded-xl bg-slate-950/60 p-4 border border-white/10 backdrop-blur-md">
              Tamil Nadu&apos;s #1 Community Emergency &amp; Help Network. Monitor live requests,
              manage verified volunteers, review impact stories, and ensure fast community
              response.
            </p>

            {/*
              NO STATS STRIP. Three figures used to sit here — "2,340+ Helps
              Resolved", "35 min Avg Response", "100% Verified Helpers" — all
              three hardcoded, and all three false. Helps resolved is a real
              countable number and it is not 2,340; average response time is not
              measured anywhere in this product; and "100% verified helpers" is
              a claim no table in this schema can support.

              They also cannot be fixed by wiring them up: this page is
              UNAUTHENTICATED, `GET /admin/dashboard` requires a session, and
              there is no public stats endpoint to read instead. A real version
              of this strip needs a public endpoint designed for it first.

              Same rule the console applies everywhere else — the dashboard
              renders an em dash rather than a plausible zero, and mobile's
              Profile card dropped its "96% Reliability" for exactly this
              reason. A number nobody can verify does not go on a login screen.
            */}
          </section>

          <section className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-[#0d1527]/85 p-5 shadow-2xl backdrop-blur-2xl sm:p-6">
              <h2 className="text-lg font-extrabold tracking-tight text-white">
                Sign In to Dashboard
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Enter your operational credentials to access the moderation panel.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3" noValidate>
                {errors.root?.message ? (
                  <p
                    role="alert"
                    className="rounded-panel border border-danger-soft-border bg-danger-soft px-3 py-1.5 text-xs text-danger-fg"
                  >
                    {errors.root.message}
                  </p>
                ) : null}

                <Field label="ADMIN EMAIL" htmlFor="email" error={errors.email?.message}>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="admin@uthavu.org"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    {...register("email")}
                    className="h-9 bg-[#060b17]/80 border-slate-700/60 text-white text-xs placeholder:text-slate-500 focus:border-[#22c55e]"
                  />
                </Field>

                <Field label="PASSWORD" htmlFor="password" error={errors.password?.message}>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    {...register("password")}
                    className="h-9 bg-[#060b17]/80 border-slate-700/60 text-white text-xs placeholder:text-slate-500 focus:border-[#22c55e]"
                  />
                </Field>

                <div className="flex items-center justify-between gap-3 text-xs">
                  <label className="flex cursor-pointer items-center gap-2 text-slate-300 select-none">
                    <input
                      type="checkbox"
                      className="size-3.5 rounded-sm accent-[#22c55e]"
                      {...register("rememberMe")}
                    />
                    Remember Me
                  </label>
                  <span className="text-[#22c55e] hover:underline cursor-pointer">
                    Forgot Password?
                  </span>
                </div>

                <Button
                  type="submit"
                  size="md"
                  className="w-full h-9 bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-semibold shadow-lg shadow-green-900/30"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Signing In…" : "Login to Console"}
                  {!isSubmitting ? <ArrowRight className="ml-1 size-3.5" /> : null}
                </Button>
              </form>

              {LOGIN_DEV_TOOLS_ENABLED && DEV_LOGINS.length > 0 ? (
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    Quick Preset Credentials
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {DEV_LOGINS.map((account) => (
                      <button
                        key={account.email}
                        type="button"
                        onClick={() => {
                          setValue("email", account.email, { shouldValidate: true });
                          setValue("password", account.password, { shouldValidate: true });
                        }}
                        className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-left transition-colors hover:border-[#22c55e]/50 hover:bg-slate-800"
                      >
                        <div>
                          <p className="text-[11px] font-semibold text-[#22c55e]">{account.label}</p>
                          <p className="text-[9px] text-slate-400">{account.email}</p>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400">Fill →</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 pt-4 text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} Uthavu · Admin command &amp; moderation console
        </footer>
      </div>
    </div>
  );
}
