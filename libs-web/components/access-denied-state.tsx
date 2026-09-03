import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "./empty-state";

/**
 * "You may not use this section."
 *
 * AN EmptyState, NOT AN ErrorState — AND THAT IS THE WHOLE POINT
 * ───────────────────────────────────────────────────────────────────────────
 * A correctly-enforced permission is the system working. Painting it red and
 * saying "something went wrong" invites an operator to file a bug against
 * correct behaviour, teaches them to distrust the errors that ARE faults, and
 * hides the one useful next step — which is knowing who to ask.
 *
 * WHAT THIS REPLACES
 * ───────────────────────────────────────────────────────────────────────────
 * Eight near-identical `*-access-denied.tsx` files, six of them 22 lines
 * differing only by a function name and two strings, each carrying its own copy
 * of the paragraph above explaining why it was an EmptyState. The reasoning
 * lives here once; the sections supply only their own two sentences.
 *
 * TITLE AND DESCRIPTION ARE THE CALLER'S BECAUSE THE REFUSAL IS SPECIFIC.
 * "Only super admins can send broadcasts" and "…can change categories" are
 * different facts with different consequences, and a generic "Access denied"
 * tells an operator nothing they can act on. Keep the copy in one constants
 * module per app so the eight sentences can be read side by side — that is the
 * only way anyone notices when one of them starts sounding like a fault.
 */
export function AccessDeniedState({
  title,
  description,
  /** A capability the refusal does NOT cover — see the note below. */
  action,
  className,
}: {
  title: string;
  description: string;
  /**
   * Scope the refusal to what is actually refused. Where a permission gates the
   * section but not everything reachable from it — an ops admin may not manage
   * other people's console accounts, but may still change their own password —
   * the door to the part they DO have must stay on screen. Otherwise they
   * follow the nav, are told no, and the capability has no other home.
   */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      icon={<ShieldAlert className="size-10" />}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}
