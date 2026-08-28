/**
 * Two corrections applied to every moderation table, via `DataTable`'s
 * `className` (which lands on the card that wraps the scroll box).
 *
 * Neither is styling. Both were measured in a real browser at 1440px, and both
 * are things `data-table.tsx` should arguably do for itself — noted in the
 * handover, since that file is outside this work's scope.
 *
 *
 * `relative` — STOPS THE WHOLE PAGE SCROLLING SIDEWAYS
 * ───────────────────────────────────────────────────────────────────────────
 * `DataTable` renders an `sr-only` <caption>, and an `sr-only` <span> for any
 * column marked `headerHidden`. Tailwind's `.sr-only` is `position: absolute`.
 * With every ancestor `position: static`, such an element's containing block is
 * the **viewport**, not the scroll box — and `overflow-x: auto` on a box that is
 * not a containing block cannot clip it.
 *
 * The consequence, measured on Comments before this fix: the right-aligned
 * "Actions" sr-only header sat at its static position of x=1748, inside a table
 * 346px wider than its scroll box. The document's scrollWidth became 1749
 * against a 1440 client, and the page scrolled sideways — dragging the content
 * out from under a header and sidebar that are `position: fixed` and therefore
 * stayed put. That is precisely the failure the layout contract exists to
 * prevent, arriving through the horizontal axis instead of the vertical one.
 *
 * Making the card a containing block restores the clip. Verified: document
 * scrollWidth back to 1440 at every width tested.
 *
 *
 * `[&_table]:table-fixed` — MAKES THE COLUMN WIDTHS MEAN SOMETHING
 * ───────────────────────────────────────────────────────────────────────────
 * `DataTable` declares widths on <col>, which under the default
 * `table-layout: auto` are only a suggestion: the browser still refuses to
 * shrink a column below its content's minimum. So one long comment body widened
 * its column, `truncate` never engaged (it needs a definite width to clamp
 * against), and the table grew until the action buttons were pushed off-screen
 * — on the two pages whose entire purpose is pressing those buttons.
 *
 * `table-fixed` makes the <col> widths authoritative. Measured on Comments at
 * 1440px: 1277px needed before, 1158px after — exactly the available width.
 * Every column in these tables declares a width, so nothing is left to share
 * out the remainder by accident.
 */
export const MODERATION_TABLE = "relative [&_table]:table-fixed";
