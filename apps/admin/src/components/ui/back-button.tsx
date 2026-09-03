"use client";

import React, { type ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/cn";

export interface BackButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  /**
   * The destination URL/Route to navigate back to.
   * If omitted or null, clicking will trigger `router.back()`.
   */
  href?: Route | string | null;
  /** Label text for the back button. Defaults to "Back" */
  label?: React.ReactNode;
  /** Visual variant of the back button */
  variant?: "pill" | "outline" | "ghost";
  /** Size variant */
  size?: "sm" | "md";
  className?: string;
}

export function BackButton({
  href,
  label = "Back",
  variant = "pill",
  size = "md",
  className,
  onClick,
  ...props
}: BackButtonProps) {
  const router = useRouter();

  const handleFallbackClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    }
    if (!e.defaultPrevented && !href) {
      router.back();
    }
  };

  const baseStyles = cn(
    "group inline-flex items-center gap-2 font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
    size === "sm" ? "text-[11px] py-1 px-2.5 rounded-full" : "text-xs py-1.5 px-3.5 rounded-full",
    variant === "pill" &&
      "border border-border/80 bg-surface/90 text-fg-subtle shadow-xs backdrop-blur-md hover:border-border hover:bg-surface hover:text-fg hover:shadow-sm dark:bg-surface/60 dark:hover:bg-surface",
    variant === "outline" &&
      "border border-border text-fg-subtle hover:border-border-strong hover:bg-surface-2 hover:text-fg",
    variant === "ghost" &&
      "text-fg-faint hover:bg-surface-2 hover:text-fg",
    className
  );

  const iconContainerStyles = cn(
    "flex items-center justify-center rounded-full transition-transform duration-200 ease-out group-hover:-translate-x-0.5",
    size === "sm" ? "size-4 text-fg-muted" : "size-5 text-fg-muted group-hover:text-primary",
    variant === "pill" && "bg-surface-3 group-hover:bg-primary-soft group-hover:text-primary-soft-fg"
  );

  const iconStyles = size === "sm" ? "size-3" : "size-3.5";

  const content = (
    <>
      <span className={iconContainerStyles}>
        <ArrowLeft className={iconStyles} aria-hidden />
      </span>
      <span>{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href as Route} className={baseStyles}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleFallbackClick} className={baseStyles} {...props}>
      {content}
    </button>
  );
}
