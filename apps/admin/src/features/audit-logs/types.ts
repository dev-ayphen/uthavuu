/**
 * `GET /admin/audit-logs` and `GET /admin/audit-logs/catalogue`.
 *
 * Shapes transcribed from the live responses, not from a doc — see
 * `apps/api/src/admin/admin-audit.service.ts` `list()` / `catalogue()` for the
 * projections these mirror.
 */

/** A key/label pair. The API authors the label; the console keeps no map. */
export type AuditRef = { key: string; label: string };

export type AuditActor = {
  userId: string | null;
  /** Snapshot taken when the action happened, so it survives the account. */
  name: string;
  email: string;
  roleKey: string;
  /** False once the admin's account is gone. The row stays readable either way. */
  accountExists: boolean;
};

export type AuditTarget = {
  type: AuditRef;
  id: string | null;
  /** Human-readable snapshot of what was acted on — a title, a category key. */
  label: string | null;
};

export type AuditLogRow = {
  id: string;
  actor: AuditActor;
  action: AuditRef;
  target: AuditTarget;
  /** Field values before the action. `null` for a create. */
  before: unknown;
  /** Field values after it. `null` for a delete. */
  after: unknown;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type AuditCatalogue = {
  /** Every action the admin surface can record — including ones never used. */
  actions: Array<AuditRef & { targetTypeKey: string }>;
  targetTypes: AuditRef[];
};
