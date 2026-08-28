// The audit catalogue: every action the admin surface can record, and the
// target types they act on. One file so db/seed-audit.ts (which writes the
// lookup rows), AdminAuditService (which resolves keys to ids) and the tests
// (which assert the two agree) can never drift apart — the same shape, and the
// same reasoning, as admin-rbac.ts.
//
// The runtime authority is the database. AdminAuditService resolves a key to an
// id by querying admin_audit_actions, so an action listed here but never seeded
// fails loudly on first use rather than silently writing an unfilterable row.
//
// ADDING AN ACTION: add it here, add it to the union below, run `pnpm db:seed`.
// Never write a raw string at a call site — AdminAuditAction is a closed union
// precisely so a typo is a compile error rather than a row nobody can find.

export const ADMIN_AUDIT_TARGET_TYPES = [
  { key: 'report', label: 'Report', sortOrder: 10 },
  { key: 'comment', label: 'Comment', sortOrder: 20 },
  { key: 'comment_flag', label: 'Comment flag', sortOrder: 30 },
  { key: 'report_category', label: 'Report category', sortOrder: 40 },
  { key: 'support_ticket', label: 'Support ticket', sortOrder: 50 },
  { key: 'user', label: 'User account', sortOrder: 60 },
] as const;

export type AdminAuditTargetType =
  (typeof ADMIN_AUDIT_TARGET_TYPES)[number]['key'];

// `target.verb`. Only actions that some endpoint in this codebase actually
// writes appear here — the same rule AdminDashboardService applies to its
// counters. A seeded action nothing can produce would put a permanently-empty
// option in the console's filter dropdown, which reads as a broken filter
// rather than as an honest "this never happened".
export const ADMIN_AUDIT_ACTIONS = [
  {
    key: 'report.close',
    label: 'Closed a report',
    targetTypeKey: 'report',
    sortOrder: 10,
  },
  {
    key: 'report.reopen',
    label: 'Reopened a report',
    targetTypeKey: 'report',
    sortOrder: 20,
  },
  {
    key: 'report.hide',
    label: 'Hid a report',
    targetTypeKey: 'report',
    sortOrder: 30,
  },
  {
    key: 'report.reinstate',
    label: 'Reinstated a hidden report',
    targetTypeKey: 'report',
    sortOrder: 40,
  },
  {
    key: 'comment.remove',
    label: 'Removed a comment',
    targetTypeKey: 'comment',
    sortOrder: 50,
  },
  {
    key: 'comment.restore',
    label: 'Restored a removed comment',
    targetTypeKey: 'comment',
    sortOrder: 60,
  },
  {
    key: 'comment_flag.resolve',
    label: 'Resolved a comment flag',
    targetTypeKey: 'comment_flag',
    sortOrder: 70,
  },
  {
    key: 'report_category.create',
    label: 'Created a report category',
    targetTypeKey: 'report_category',
    sortOrder: 80,
  },
  {
    key: 'report_category.update',
    label: 'Updated a report category',
    targetTypeKey: 'report_category',
    sortOrder: 90,
  },
  {
    key: 'report_category.delete',
    label: 'Deleted a report category',
    targetTypeKey: 'report_category',
    sortOrder: 100,
  },
  {
    key: 'support_ticket.status_change',
    label: "Changed a support ticket's status",
    targetTypeKey: 'support_ticket',
    sortOrder: 110,
  },
  // Account suspension. The audit row is the ONLY durable history of a
  // suspension — user_account_status holds just the current state, so a
  // suspend/reactivate/re-suspend cycle is reconstructable only from here.
  {
    key: 'user.suspend',
    label: 'Suspended a user account',
    targetTypeKey: 'user',
    sortOrder: 120,
  },
  {
    key: 'user.reactivate',
    label: 'Reactivated a suspended user account',
    targetTypeKey: 'user',
    sortOrder: 130,
  },
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]['key'];

export const ADMIN_AUDIT_ACTION_KEYS: readonly AdminAuditAction[] =
  ADMIN_AUDIT_ACTIONS.map((a) => a.key);

export const ADMIN_AUDIT_TARGET_TYPE_KEYS: readonly AdminAuditTargetType[] =
  ADMIN_AUDIT_TARGET_TYPES.map((t) => t.key);
