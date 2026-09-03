"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "../lib/cn";

const TRIGGER_CLASS =
  "inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface-2 px-2.5 text-xs font-semibold text-fg-muted transition-colors hover:border-primary-soft-border hover:text-primary-soft-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas outline-none";

/**
 * Light/dark switch.
 *
 * The label names the theme you are switching TO, which is how every OS-level
 * toggle reads and what the approved design shows.
 *
 * `mounted` matters: on the server there is no persisted theme to read, so
 * rendering the real label immediately would mismatch during hydration. Until
 * mounted we render a same-size placeholder so the header does not shift.
 *
 * It is derived with `useSyncExternalStore` (server snapshot false, client
 * snapshot true) rather than "useState + set it in an effect" — the effect
 * form triggers a second render pass on every mount, which React 19 flags.
 */
const noopSubscribe = () => () => {};
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return <div className={cn(TRIGGER_CLASS, "w-[5.25rem] opacity-0", className)} aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      className={cn(TRIGGER_CLASS, "w-[5.25rem] justify-center", className)}
    >
      {isDark ? (
        <Sun className="size-4 text-accent-amber-fg" />
      ) : (
        <Moon className="size-4 text-fg-subtle" />
      )}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
