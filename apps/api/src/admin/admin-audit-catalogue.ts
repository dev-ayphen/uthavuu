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
  { key: 'community_update', label: 'Community update', sortOrder: 70 },
  { key: 'platform_setting', label: 'Platform setting', sortOrder: 80 },
  { key: 'sponsor', label: 'Sponsor', sortOrder: 90 },
  // The console's own operators. Every other target type here is something
  // admins do to citizens or their content; this one is what admins do to each
  // other, which is the set of actions with no second surface to notice them.
  { key: 'admin', label: 'Admin account', sortOrder: 100 },
  // Community -> Broadcasts. The only target type whose actions reach the
  // public directly: a broadcast writes into every selected citizen's alert
  // list and pushes to their handset, and `broadcast.send` cannot be undone.
  { key: 'broadcast', label: 'Broadcast', sortOrder: 110 },
  // Photo verification. Distinct from `report` because the target is one image
  // inside a report, not the report: approving a held photo publishes it while
  // leaving every other moderation fact about the report unchanged, and an
  // audit row that named the report would not say WHICH photo was decided on.
  { key: 'report_photo', label: 'Report photo', sortOrder: 120 },
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
  // Community -> Updates. An announcement is published to the entire user base,
  // so every one of these five is a question somebody asks afterwards: who
  // published the flood notice, who edited its wording, who took it down. The
  // `before`/`after` diff carries the copy itself, which is what makes
  // `community_update.delete` reviewable at all — the row is soft-deleted, but
  // the audit entry is where the text that was live is recorded as such.
  {
    key: 'community_update.create',
    label: 'Created a community update',
    targetTypeKey: 'community_update',
    sortOrder: 140,
  },
  {
    key: 'community_update.update',
    label: 'Edited a community update',
    targetTypeKey: 'community_update',
    sortOrder: 150,
  },
  {
    key: 'community_update.publish',
    label: 'Published a community update',
    targetTypeKey: 'community_update',
    sortOrder: 160,
  },
  {
    key: 'community_update.archive',
    label: 'Archived a community update',
    targetTypeKey: 'community_update',
    sortOrder: 170,
  },
  {
    key: 'community_update.delete',
    label: 'Deleted a community update',
    targetTypeKey: 'community_update',
    sortOrder: 180,
  },
  // Platform -> App Settings. One action, not eleven: a settings PATCH is a
  // single audited act whose `before`/`after` diff already names exactly which
  // keys moved, so a per-key action would multiply the catalogue without adding
  // anything the diff does not already say. It matters most for
  // `maintenance_mode` and `read_only_mode` — "who paused the platform, when,
  // and did they turn it back on" is answerable only from here, because the
  // table itself holds current state and no history.
  {
    key: 'platform_setting.update',
    label: 'Updated platform settings',
    targetTypeKey: 'platform_setting',
    sortOrder: 190,
  },
  {
    key: 'sponsor.create',
    label: 'Created a sponsor',
    targetTypeKey: 'sponsor',
    sortOrder: 200,
  },
  {
    key: 'sponsor.update',
    label: 'Updated a sponsor',
    targetTypeKey: 'sponsor',
    sortOrder: 210,
  },
  {
    key: 'sponsor.pause',
    label: 'Paused a sponsor',
    targetTypeKey: 'sponsor',
    sortOrder: 220,
  },
  {
    key: 'sponsor.activate',
    label: 'Activated a sponsor',
    targetTypeKey: 'sponsor',
    sortOrder: 230,
  },
  {
    key: 'sponsor.delete',
    label: 'Deleted a sponsor',
    targetTypeKey: 'sponsor',
    sortOrder: 240,
  },
  // Platform -> Admins. These seven are the trail of last resort: every other
  // admin action is visible to a second admin who can review it, but "who gave
  // themselves a colleague's console access" has no such reader. Three of them
  // (suspend, revoke, role_change) are also the actions the last-super-admin
  // and no-self rules exist to fence, so the refusals and the successes are
  // reconstructable from the same place.
  //
  // NOTE ON `admin.password_reset`: it is written by BOTH
  // POST /admin/admins/:id/reset-password and POST /admin/me/change-password.
  // The two are distinguishable without a second key — a self-service change
  // has actor_user_id == target_id — and no password, hash or length is ever
  // recorded in `before`/`after` for either. The recordable fact is that the
  // credential changed, not what it changed to.
  {
    key: 'admin.create',
    label: 'Provisioned an admin account',
    targetTypeKey: 'admin',
    sortOrder: 250,
  },
  {
    key: 'admin.update',
    label: "Edited an admin's name or email",
    targetTypeKey: 'admin',
    sortOrder: 260,
  },
  {
    key: 'admin.role_change',
    label: "Changed an admin's role",
    targetTypeKey: 'admin',
    sortOrder: 270,
  },
  {
    key: 'admin.password_reset',
    label: 'Reset an admin password',
    targetTypeKey: 'admin',
    sortOrder: 280,
  },
  {
    key: 'admin.suspend',
    label: 'Suspended an admin account',
    targetTypeKey: 'admin',
    sortOrder: 290,
  },
  {
    key: 'admin.reactivate',
    label: 'Reactivated a suspended admin account',
    targetTypeKey: 'admin',
    sortOrder: 300,
  },
  // Revokes CONSOLE ACCESS — deletes the admin_users row only. The person keeps
  // their user account and everything they created; deleting a user is a
  // different, far more destructive operation (UsersService.deleteAccount).
  {
    key: 'admin.revoke',
    label: 'Revoked admin access',
    targetTypeKey: 'admin',
    sortOrder: 310,
  },
  // Platform -> Support, the conversation half. `support_ticket.status_change`
  // (sortOrder 110) predates these and still covers a plain status move.
  //
  // WHY REPLYING IS AUDITED AT ALL, WHEN THE MESSAGE IS ITSELF A PERMANENT ROW.
  // `support_ticket_messages` records what was said and by which user id. It
  // does NOT record the role that person held at the time, and `admin_users`
  // CASCADEs on user deletion — so once a support agent's console access is
  // revoked, the thread alone cannot show that the reply came from staff acting
  // in an official capacity. The audit row snapshots actor, email and role, the
  // same reason ADR 0012 gives for snapshotting them everywhere else.
  //
  // `note` is separate from `reply` rather than a flag on it, because the two
  // are different acts with different audiences: a reply is a promise made to a
  // citizen, a note is a claim made about them that the citizen will never see
  // and therefore cannot contest. "Who has been writing internal notes about
  // this person" is a question that deserves its own filter option.
  {
    key: 'support_ticket.priority_change',
    label: "Changed a support ticket's priority",
    targetTypeKey: 'support_ticket',
    sortOrder: 320,
  },
  {
    key: 'support_ticket.category_change',
    label: "Changed a support ticket's category",
    targetTypeKey: 'support_ticket',
    sortOrder: 330,
  },
  {
    key: 'support_ticket.assign',
    label: 'Assigned a support ticket',
    targetTypeKey: 'support_ticket',
    sortOrder: 340,
  },
  {
    key: 'support_ticket.reply',
    label: 'Replied to a support ticket',
    targetTypeKey: 'support_ticket',
    sortOrder: 350,
  },
  {
    key: 'support_ticket.note',
    label: 'Added an internal note to a support ticket',
    targetTypeKey: 'support_ticket',
    sortOrder: 360,
  },
  {
    key: 'support_ticket.resolve',
    label: 'Resolved a support ticket',
    targetTypeKey: 'support_ticket',
    sortOrder: 370,
  },
  {
    key: 'support_ticket.close',
    label: 'Closed a support ticket',
    targetTypeKey: 'support_ticket',
    sortOrder: 380,
  },
  // Community -> Broadcasts.
  //
  // ON THE NUMBERING: 390+ because the support-ticket block above claimed
  // 320-380 while this one was being written. `catalogue()` orders by
  // sort_order in SQL and admin-audit.service.spec.ts asserts that order
  // against a JS sort of this same array, so two rows sharing a sort_order make
  // the two disagree on the tie — a genuinely confusing failure. The rule that
  // avoids it: read the current tail immediately before appending and go above
  // it, never "the next round number I remember".
  //
  // `broadcast.send` is the most consequential key in this catalogue. It is the
  // only admin action that notifies every selected citizen at once, and it is
  // IRREVERSIBLE. Its row is written when the send is CLAIMED, not when the
  // fan-out finishes (AdminBroadcastsService.claimForSending), so "who sent the
  // flood warning, to which audience, and when" survives a fan-out that dies
  // halfway — which is precisely the case where the question gets asked.
  //
  // The recipient/delivery counts are deliberately NOT in that row: they are not
  // known at claim time, and an audit entry asserting a number that later turned
  // out to be wrong is worse than one that does not assert it. They live on the
  // `broadcasts` row.
  {
    key: 'broadcast.create',
    label: 'Created a broadcast',
    targetTypeKey: 'broadcast',
    sortOrder: 390,
  },
  {
    key: 'broadcast.update',
    label: 'Edited a broadcast',
    targetTypeKey: 'broadcast',
    sortOrder: 400,
  },
  {
    key: 'broadcast.send',
    label: 'Sent a broadcast',
    targetTypeKey: 'broadcast',
    sortOrder: 410,
  },
  {
    key: 'broadcast.cancel',
    label: 'Cancelled a scheduled broadcast',
    targetTypeKey: 'broadcast',
    sortOrder: 420,
  },
  {
    key: 'broadcast.delete',
    label: 'Deleted a draft broadcast',
    targetTypeKey: 'broadcast',
    sortOrder: 430,
  },
  // Reports -> Photo review. These three are the human half of photo
  // verification: the machine verdict decided the photo needed a person, and
  // these record what the person did about it. `approve` is the only one that
  // makes an image public, which is why it is audited as carefully as a hide.
  {
    key: 'report_photo.approve',
    label: 'Approved a held report photo',
    targetTypeKey: 'report_photo',
    sortOrder: 440,
  },
  {
    key: 'report_photo.reject',
    label: 'Rejected a report photo',
    targetTypeKey: 'report_photo',
    sortOrder: 450,
  },
  {
    key: 'report_photo.request_new',
    label: 'Asked the reporter for a replacement photo',
    targetTypeKey: 'report_photo',
    sortOrder: 460,
  },
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]['key'];

export const ADMIN_AUDIT_ACTION_KEYS: readonly AdminAuditAction[] =
  ADMIN_AUDIT_ACTIONS.map((a) => a.key);

export const ADMIN_AUDIT_TARGET_TYPE_KEYS: readonly AdminAuditTargetType[] =
  ADMIN_AUDIT_TARGET_TYPES.map((t) => t.key);
