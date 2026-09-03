"use client";

import type { ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Switch } from "@/components/ui";

/**
 * A settings row's switch.
 *
 * The control itself — the real `<input type="checkbox" role="switch">`, the
 * peer-driven track and knob, the whole-row hit target — is
 * `@uthavu/libs-web`'s `Switch`, along with the reasoning for every one of
 * those choices. What stays here is one thing: this form binds React Hook
 * Form, and `registration` is the shape RHF hands back.
 *
 * WHY THE `registration` PROP SURVIVED THE MOVE
 * ───────────────────────────────────────────────────────────────────────────
 * `Switch` takes plain input props, so `{...register("x")}` works on it
 * directly and this adapter is not strictly required. It is kept because every
 * call site in the settings form already passes `registration=`, and because
 * naming it makes the rule visible: there is no uncontrolled, decorative
 * variant of this control in the console. The prototype shipped fourteen
 * toggles of which eleven did nothing, and the way that happened was a switch
 * that could be rendered without being wired to anything.
 */
export function SettingSwitch({
  label,
  description,
  registration,
  disabled,
  className,
}: {
  label: string;
  /** Says what turning it ON does. Excluded from the accessible NAME. */
  description: ReactNode;
  registration: UseFormRegisterReturn;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Switch
      label={label}
      description={description}
      disabled={disabled}
      className={className}
      {...registration}
    />
  );
}
