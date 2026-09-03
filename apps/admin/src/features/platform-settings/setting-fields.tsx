"use client";

import { AlertTriangle } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Alert, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { RADIUS_OPTIONS, isRadiusOption } from "./types";

/**
 * The non-boolean controls on the settings form.
 *
 * `Field` + `Input` come from `@/components/ui`; these are the wiring between
 * them and React Hook Form, plus the one control the shared library does not
 * have (a radius chooser). Nothing here re-implements a shared primitive.
 */

/** What `register("appName")` hands back. */
type Registration = UseFormRegisterReturn;

export function SettingTextField({
  label,
  error,
  hint,
  warning,
  registration,
  // Deliberately pulled OUT of the spread: on a field component `className`
  // reads as "how this field sits in its grid", and every caller means the
  // wrapper. Letting it fall through to `<Input>` would silently drop a
  // `sm:col-span-2` onto the control instead of onto the cell.
  className,
  ...inputProps
}: {
  label: string;
  error?: string;
  hint?: string;
  /** A non-blocking "this looks wrong" note. Never blocks Save — see `schema.ts`. */
  warning?: ReactNode;
  registration: Registration;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  // `useId` rather than a hand-written string: several of these render on one
  // page and a duplicated `id` would silently point two labels at one input.
  const id = useId();

  return (
    <div className={cn("space-y-2", className)}>
      <Field label={label} htmlFor={id} error={error} hint={hint}>
        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...inputProps}
          {...registration}
        />
      </Field>
      {/* Only when the field is otherwise valid: a warning under a red error
          is two competing instructions about one field. */}
      {warning && !error ? <FieldWarning>{warning}</FieldWarning> : null}
    </div>
  );
}

/**
 * A whole number.
 *
 * `type="text"` with `inputMode="numeric"`, NOT `type="number"`. A number input
 * silently changes a focused value on a scroll-wheel tick — an operator
 * scrolling this page past a focused "max photos" field can change it without
 * ever knowing — and its spinner and decimal separator follow the browser
 * locale. The schema is what enforces "whole number in range"; see `schema.ts`.
 */
export function SettingNumberField({
  label,
  error,
  hint,
  registration,
  suffix,
}: {
  label: string;
  error?: string;
  hint?: string;
  registration: Registration;
  /** Unit shown inside the control, e.g. "photos". Decorative. */
  suffix?: string;
}) {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn("tabular", suffix && "pr-20")}
          {...registration}
        />
        {suffix ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs text-fg-faint"
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * The default discovery radius: exactly one of 1 / 3 / 5 / 10 km.
 *
 * A radio group, not a select and not a free number. The contract fixes four
 * values because those are the four the mobile app's discovery filter offers —
 * any other number is a radius no citizen can ever be shown — and four options
 * are better read side by side than opened one at a time.
 *
 * All four inputs share ONE registration: React Hook Form groups radios by
 * `name`, and each `value` below is the string the form carries.
 */
export function RadiusChoice({
  registration,
  value,
  error,
}: {
  registration: Registration;
  /** The current form value, watched by the parent — used to flag bad stored data. */
  value: string;
  error?: string;
}) {
  const offContract = value.trim() !== "" && !isRadiusOption(value);

  return (
    <fieldset className="space-y-1.5">
      <legend className="micro-label mb-1.5 block text-fg-muted">Default search radius</legend>

      <div className="flex flex-wrap gap-2">
        {RADIUS_OPTIONS.map((option) => (
          <label key={option} className="cursor-pointer">
            <input type="radio" value={option} className="peer sr-only" {...registration} />
            <span
              className={cn(
                "block rounded-pill border border-border bg-surface px-3.5 py-1.5 text-xs font-bold text-fg-muted transition-colors",
                "hover:border-border-strong hover:text-fg",
                "peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary-soft-fg",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
              )}
            >
              {option} km
            </span>
          </label>
        ))}
      </div>

      {error ? (
        <p className="text-xs font-medium text-danger-fg">{error}</p>
      ) : (
        <p className="text-xs text-fg-faint">
          What the app pre-selects when a citizen opens the map. They can still widen or narrow it
          themselves.
        </p>
      )}

      {/* Bad stored data, surfaced rather than silently rewritten. Reachable
          only if something wrote a radius outside the contract's four. */}
      {offContract ? (
        <FieldWarning>
          The saved value is <span className="tabular font-bold">{value} km</span>, which is not one
          of the four radii the app offers. Pick one above and save to correct it.
        </FieldWarning>
      ) : null}
    </fieldset>
  );
}

/** A note that does NOT block a save. Amber, never red — red means refused. */
export function FieldWarning({ children }: { children: ReactNode }) {
  return (
    <Alert tone="warning" icon={AlertTriangle}>
      {children}
    </Alert>
  );
}
