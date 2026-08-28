// Audit-trail master data: the action and target-type lookup rows every
// mutating /admin route resolves against.
//
// In its own file for the same reason seed-admins.ts is: the catalogue it
// writes lives next to the code that reads it (../admin/admin-audit-catalogue.ts),
// and keeping the loop here means seed.ts gains one line rather than eighty.
//
// Upserts by `key`, so a re-seed is a no-op on unchanged rows and a label
// correction on changed ones — never a duplicate, never a failure.
import { uuidv7 } from 'uuidv7';
import { sql } from 'drizzle-orm';
import { db } from './index';
import {
  adminAuditActions,
  adminAuditTargetTypes,
} from './schema/audit-schema';
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_TARGET_TYPES,
} from '../admin/admin-audit-catalogue';

export async function seedAuditCatalogue(): Promise<{
  actions: number;
  targetTypes: number;
}> {
  for (const targetType of ADMIN_AUDIT_TARGET_TYPES) {
    await db
      .insert(adminAuditTargetTypes)
      .values({ id: uuidv7(), ...targetType })
      .onConflictDoUpdate({
        target: adminAuditTargetTypes.key,
        set: {
          label: targetType.label,
          sortOrder: targetType.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const action of ADMIN_AUDIT_ACTIONS) {
    await db
      .insert(adminAuditActions)
      .values({ id: uuidv7(), ...action })
      .onConflictDoUpdate({
        target: adminAuditActions.key,
        set: {
          label: action.label,
          targetTypeKey: action.targetTypeKey,
          sortOrder: action.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  return {
    actions: ADMIN_AUDIT_ACTIONS.length,
    targetTypes: ADMIN_AUDIT_TARGET_TYPES.length,
  };
}
