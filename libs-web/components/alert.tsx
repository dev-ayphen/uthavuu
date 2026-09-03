import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** Structurally what every lucide icon is, without depending on lucide's own type. */
type Glyph = (props: { className?: string; "aria-hidden"?: boolean }) => ReactNode;
import { cn } from "../lib/cn";

/**
 * A message strip: icon, one line (or a titled block), a tint that says how
 * loud it is.
 *
 * WHAT THIS REPLACES
 * ───────────────────────────────────────────────────────────────────────────
 * The console hand-rolled this same strip in ~30 places — every form's
 * `errors.root` banner, the settings page's amber `FieldWarning`, the support
 * composer's "the citizen sees this" note — and they had already drifted into
 * two sizes and four near-identical class lists. It is one component with a
 * `tone` and a `size` instead.
 *
 * THE MARKUP IS EXACTLY WHAT THE HAND-ROLLED COPIES EMITTED
 * ───────────────────────────────────────────────────────────────────────────
 * The icon is a DIRECT flex child carrying `mt-0.5 shrink-0` itself, and the
 * body is a bare `<span>` when there is no title — not a wrapper `<div>` around
 * either. That is not fussiness: a `<span>` wrapper around the icon becomes a
 * blockified flex item whose height is then subject to `line-height`, which
 * moves the glyph a pixel or two off the first text line. This component's job
 * is to render byte-for-byte what the copies it replaces rendered, so nothing
 * on screen moves when a call site adopts it.
 *
 * TONE IS NOT DECORATION
 * ───────────────────────────────────────────────────────────────────────────
 *   danger   the action was refused or failed. Red means "no".
 *   warning  something is off but the save still went through. Amber, never red.
 *   info     context the operator needs before acting — who will see this.
 *   success  it worked, and the confirmation has to stay on screen.
 *   neutral  a plain statement. Used for a refusal the system MEANT to give,
 *            where red would read as a fault in the console rather than an
 *            answer from it.
 *
 * `announce` IS SEPARATE FROM `tone` ON PURPOSE
 * ───────────────────────────────────────────────────────────────────────────
 * `role="alert"` interrupts a screen-reader user mid-sentence. That is right
 * for a submit that just failed — focus stays in the form and there is no other
 * feedback — and wrong for a note that was on screen before they arrived, or
 * for an expected refusal. Danger announces by default because it is almost
 * always the former; everything else stays quiet unless asked.
 */

export type AlertTone = "danger" | "warning" | "info" | "success" | "neutral" | "primary";
export type AlertSize = "sm" | "md";
/**
 * Where the icon sits against the text.
 *
 * `start` is right for anything that might wrap to a second line — the glyph
 * belongs on the first line, not floating in the middle of the paragraph.
 * `center` is right for a one-line strip, where `items-start` leaves the icon
 * looking dropped. The console had both, and the difference is real enough
 * that collapsing it would move glyphs.
 */
export type AlertAlign = "start" | "center";

const TONE: Record<AlertTone, string> = {
  danger: "border-danger-soft-border bg-danger-soft text-danger-fg",
  warning: "border-warning-soft-border bg-warning-soft text-warning-fg",
  info: "border-info-soft-border bg-info-soft text-info-fg",
  success: "border-success-soft-border bg-success-soft text-success-fg",
  neutral: "border-border bg-surface-2 text-fg-subtle",
  primary: "border-primary-soft-border bg-primary-soft text-primary-soft-fg",
};

const DEFAULT_ICON: Record<AlertTone, Glyph> = {
  danger: TriangleAlert,
  warning: TriangleAlert,
  info: Info,
  success: CircleCheck,
  neutral: Info,
  primary: Info,
};

/**
 * `sm` sits inside a dialog or under a field; `md` sits above a whole form.
 *
 * The icon class is a whole literal string rather than something composed at
 * render time. Tailwind v4 scans source text, so an interpolated class is one
 * that never gets emitted — and it fails silently: the icon renders, at
 * whatever size it happens to inherit.
 */
const SIZE: Record<AlertSize, { box: string; icon: Record<AlertAlign, string> }> = {
  sm: {
    box: "rounded-control px-3 py-2 text-xs",
    icon: { start: "mt-0.5 size-3.5 shrink-0", center: "size-3.5 shrink-0" },
  },
  md: {
    box: "rounded-card px-3.5 py-3 text-sm",
    icon: { start: "mt-0.5 size-4 shrink-0", center: "size-4 shrink-0" },
  },
};

export type AlertProps = {
  tone?: AlertTone;
  size?: AlertSize;
  align?: AlertAlign;
  /** A bold first line. Omit for a one-sentence strip. */
  title?: ReactNode;
  children?: ReactNode;
  /**
   * Replaces the tone's default icon. Takes the lucide COMPONENT (`icon={Eye}`),
   * not an element — so this component applies the size classes for the variant
   * and a call site cannot ship a 16px glyph in a 14px strip. Pass `null` for no
   * icon at all, which is right when the strip is one short line and the tint
   * already carries the meaning.
   */
  icon?: Glyph | null;
  /**
   * Interrupt a screen reader. Defaults to true for `danger`. Set it false for
   * an expected refusal, or for a note that was already on screen when the
   * operator arrived; set it true on a `warning` that appeared in response to
   * something they just did.
   */
  announce?: boolean;
  /**
   * A dashed outline instead of a solid one — the console's established way of
   * saying "this stands in for something absent", as opposed to a statement
   * about something present. Used for a missing translation, a closed thread.
   */
  dashed?: boolean;
  className?: string;
};

export function Alert({
  tone = "danger",
  size = "sm",
  align = "start",
  title,
  children,
  icon,
  announce,
  dashed = false,
  className,
}: AlertProps) {
  const shape = SIZE[size];
  const Icon = icon ?? DEFAULT_ICON[tone];
  const shouldAnnounce = announce ?? tone === "danger";

  return (
    <div
      // `role` rather than `aria-live`: this element is usually mounted BY the
      // event it describes, and a live region has to exist before the change to
      // announce it. `role="alert"` is announced on insertion.
      role={shouldAnnounce ? "alert" : undefined}
      className={cn(
        "flex gap-2 border",
        align === "center" ? "items-center" : "items-start",
        dashed && "border-dashed",
        TONE[tone],
        shape.box,
        className,
      )}
    >
      {icon === null ? null : <Icon aria-hidden className={shape.icon[align]} />}
      {title ? (
        <div className="min-w-0 flex-1">
          <p className="font-bold">{title}</p>
          {children ? <div className="mt-1 min-w-0">{children}</div> : null}
        </div>
      ) : children ? (
        // Only when there IS a body. An empty `<span>` is still a flex item,
        // and its line-height would push a short icon-only strip two pixels
        // taller than the markup this replaces.
        <span>{children}</span>
      ) : null}
    </div>
  );
}
