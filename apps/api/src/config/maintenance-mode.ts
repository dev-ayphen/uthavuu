// The decision half of the two kill switches. Pure, synchronous, and
// dependency-free on purpose — see the WHY IT RETURNS A DECISION note in
// account-status/login-block.ts, which this file deliberately mirrors.
//
// The riskiest thing about a maintenance switch is not that it fails to block
// writes; it is that it blocks the wrong ones. If `/admin/*` or the auth routes
// go down with everything else, the operator who flipped the switch on cannot
// sign in to flip it back off, and the product is bricked until somebody runs
// SQL by hand. Keeping that rule in a plain function is what makes it testable
// without a NestJS execution context — maintenance-mode.spec.ts asserts the
// exemption directly.

/** The two kill switches, in precedence order. */
export type WriteBlockCode = 'MAINTENANCE_MODE' | 'READ_ONLY_MODE';

export interface WriteBlock {
  code: WriteBlockCode;
  message: string;
}

/**
 * HTTP methods that change state. GET/HEAD/OPTIONS are never blocked: both
 * switches are "you can still look, you just can't post", so a citizen in
 * maintenance sees a working, read-only app rather than a wall of errors.
 */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

/**
 * Route prefixes both switches must never block.
 *
 * `/admin`   — the console, including `PATCH /admin/settings`, which is the
 *              only way to switch maintenance back off through the product.
 * `/api/auth` — Better Auth's own routes (sign-in, sign-out, session, OTP).
 *              `POST /api/auth/sign-in/email` is how an operator gets a session
 *              in the first place. In practice these are served by middleware
 *              that returns before any guard runs, so this entry is
 *              belt-and-braces rather than the only thing protecting them —
 *              which is exactly what it should be for the route that unbricks
 *              the product.
 *
 * NOTE FOR THE FUTURE: main.ts sets no global prefix today. If one is ever
 * added, these strings must move with it, and maintenance-mode.spec.ts is where
 * that will be caught.
 */
export const MAINTENANCE_EXEMPT_PATH_PREFIXES = ['/admin', '/api/auth'];

/**
 * Prefix match at a SEGMENT boundary, so `/admin` and `/admin/settings` are
 * exempt but a future `/administrators` route would not accidentally be.
 */
export function isExemptPath(path: string): boolean {
  const normalised = path.split('?')[0].replace(/\/+$/, '') || '/';

  return MAINTENANCE_EXEMPT_PATH_PREFIXES.some(
    (prefix) => normalised === prefix || normalised.startsWith(`${prefix}/`),
  );
}

export const MAINTENANCE_MODE_MESSAGE =
  'Uthavu is down for maintenance right now. You can still browse, but posting is paused. Please try again shortly.';

export const READ_ONLY_MODE_MESSAGE =
  'Uthavu is in read-only mode right now. You can still browse, but posting is paused. Please try again shortly.';

export interface WriteBlockInput {
  method: string;
  path: string;
  /**
   * True when the route belongs to an admin controller.
   *
   * Passed in rather than derived from `path` so the exemption survives a
   * global prefix, a controller moving, or anything else that changes the URL
   * without changing what the route is. MaintenanceGuard computes it from the
   * controller's own guard metadata — the same metadata
   * admin-module-guard.spec.ts asserts every admin controller carries.
   */
  isAdminRoute: boolean;
  settings: { maintenanceMode: boolean; readOnlyMode: boolean };
}

/**
 * Whether this request is even a candidate for blocking.
 *
 * Split out so MaintenanceGuard can skip the settings read entirely on a GET or
 * an admin route — most traffic — without restating the exemption rules at the
 * call site. `decideWriteBlock` calls it too, so the guard's fast path and the
 * decision can never disagree about who is exempt.
 */
export function needsWriteBlockCheck(
  input: Omit<WriteBlockInput, 'settings'>,
): boolean {
  if (input.isAdminRoute) return false;
  if (isExemptPath(input.path)) return false;
  return isMutatingMethod(input.method);
}

/**
 * Returns the block to apply, or null to let the request through.
 *
 * Precedence: `maintenance_mode` wins over `read_only_mode` when both are on.
 * They block the same requests, so the only thing precedence decides is which
 * code the client is told — and "we are down for maintenance" is the more
 * specific, more actionable of the two.
 */
export function decideWriteBlock(input: WriteBlockInput): WriteBlock | null {
  if (!needsWriteBlockCheck(input)) return null;

  if (input.settings.maintenanceMode) {
    return { code: 'MAINTENANCE_MODE', message: MAINTENANCE_MODE_MESSAGE };
  }

  if (input.settings.readOnlyMode) {
    return { code: 'READ_ONLY_MODE', message: READ_ONLY_MODE_MESSAGE };
  }

  return null;
}
