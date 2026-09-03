import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "../lib/cn";

type SlotProps = { children?: ReactNode; className?: string } & Record<string, unknown>;

/**
 * Minimal `asChild` implementation.
 *
 * Merges this component's props onto its single child element so a Button can
 * render as a Link without nesting an <a> inside a <button>. We keep a local
 * copy rather than pulling in @radix-ui/react-slot — this is the only Radix
 * behaviour the scaffold needs today. Swap it for the real Slot when the
 * shared component library arrives.
 */
export function Slot({ children, className, ...props }: SlotProps) {
  if (!isValidElement(children)) return null;

  const child = children as ReactElement<Record<string, unknown>>;
  const childProps = child.props;

  return cloneElement(child, {
    ...props,
    ...childProps,
    className: cn(className, childProps.className as string | undefined),
  });
}

export { Children };
