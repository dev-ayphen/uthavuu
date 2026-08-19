# 09 — Admins & audit

> Admin account management — the console's own user directory, with roles, a six-flag
> permission matrix, and add/edit modals.
>
> ⚠️ **The permission matrix is stored and never enforced**, and the tab itself has no role
> guard — an Ops Moderator can create a Super Admin.

| | |
|---|---|
| **Tab** | `admins` `:3457` |
| **Source** | `apps/web/src/app/admin/dashboard/page.tsx` |
| **Line refs valid as of** | 2026-08-18 |
| **Sidebar** | Admin (single, badge = `admins.length`) |
| **Data** | `MOCK_ADMINS` `:159` (3) · `AdminRecord` interface `:140` |
| **Related** | Audit Logs lives in [07 §5](./07-platform-settings.md#5-audit-logs-3217--read-only) |

---

## 0. Layout

### 0.1 Admin Management (`:3457`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 👨‍💼 Admin Management                                   [ + Add Admin ]     │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌────────────┐┌────────────┐┌────────────┐                               │
│ │Total Admins││Active      ││Suspended   │                 :3474–3476    │
│ │     6      ││     5      ││     1      │                               │
│ └────────────┘└────────────┘└────────────┘                               │
├──────────────────────────────────────────────────────────────────────────┤
│ Name & Contact│Email│Role│Status│Last Login│Permissions│Actions   :3493  │
│ ───────────────────────────────────────────────────────────────────────  │
│ ⓐ Arjun Menon  arjun@…  Super  Active  2h ago  ●●●●●●   [Edit][Suspend] │
│ ⓚ Kavya Iyer   kavya@…  Ops    Active  1d ago  ●●○○○○   [Edit][Suspend] │
│ …                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
        │ [ + Add Admin ]                    │ [ Edit ]
        ▼                                    ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│ ADD ADMIN         :3520   │   │ EDIT ADMIN        :3622   │
│ Name *                    │   │ Name                      │
│ Email *                   │   │ Email                     │
│ Password *      (min 8)   │   │ Role ▾                    │
│ Confirm Password *        │   │ Status ▾                  │
│ Role ▾                    │   │ ☑ 6 permission flags      │
│ ☑ 6 permission flags      │   │                           │
│ [ Cancel ] [ Add Admin ]  │   │ [ Cancel ] [ Save ]       │
│   ↑ disabled until 5 rules│   │   ↑ no validation         │
│     pass — see §3A        │   │                           │
└───────────────────────────┘   └───────────────────────────┘
```

**The add-admin form is the only properly validated form in either product** — 5 enforced
rules (§3A). The edit modal beside it enforces nothing.

### 0.2 Administrator Audit Logs (`:3217`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 📋 Administrator Audit Logs                                              │
├──────────────────────────────────────────────────────────────────────────┤
│ Admin │ Action │ Module │ Old Value │ New Value │ Time │ IP Address      │
│ ───────────────────────────────────────────────────────────────────────  │
│ Arjun   Updated   Settings   5 km       10 km    2h ago  192.168.1.10    │
│ Kavya   Suspended Users      Active     Susp.    1d ago  192.168.1.24    │
│ …                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Columns at `:3227`. **Read-only** — no filter, no search, no export, no date range.

🔴 **Nothing writes to this table.** Every destructive action elsewhere in the console —
suspend, delete, remove flag, change settings — mutates state without appending a log entry.
The 6 rows are `MOCK_AUDIT_LOGS` (`:268`) and never grow. See §5.

---

## 1. The `AdminRecord` model (`:140–157`)

```ts
interface AdminRecord {
  id: number;
  name: string;
  email: string;
  role: 'Super Admin' | 'Moderator' | 'Reviewer';
  lastLogin: string;
  status: 'Active' | 'Suspended';
  phone: string;
  password: string;                    // ⚠️ plaintext field on the record
  permissions: {
    users: boolean; reports: boolean; comments: boolean;
    analytics: boolean; settings: boolean; deleteAll: boolean;
  };
}
```

One of only two typed interfaces in the file (the other is `Sponsor`). Everything else is
inferred from object literals.

### 1.1 Seeded admins (`:159`)

| Name | Email | Role | users | reports | comments | analytics | settings | deleteAll |
|---|---|---|---|---|---|---|---|---|
| Super Admin | `admin@uthavu.org` | Super Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ops Admin | `ops@uthavu.org` | Moderator | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reviewer One | `review1@uthavu.org` | Reviewer | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |

The first two match the hardcoded login credentials in
[01 §3.1](./01-admin-login.md#31-accounts). **`review1@uthavu.org` cannot log in** — the
login page only knows two pairs, so the Reviewer role exists in data and has no way in.

`password` is `''` on all three seeds.

---

## 2. Interaction map

### List

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **+ Add Admin** | `:3465` | Resets the form to blank with `role: 'Reviewer'` and opens the modal | ✅ |
| 2 | **Edit** | `:3534` | `setEditingAdmin({ ...a })` — copies the record so edits don't mutate the list until saved | ✅ |
| 3 | **Suspend / Activate** | `:3538` | ✅ Flips `Active ⇄ Suspended` | ✅ |
| 4 | **Remove** | `:3545` | ✅ `if (confirm('Remove {name}?'))` then filters the list — **a native confirm, the only one in the console besides user deletion** | ✅ |

### Edit modal

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 5 | ✕ / Cancel | `:3572`, `:3651` | Closes, discarding edits | ✅ |
| 6 | **👁 password visibility** | `:3620` | Toggles the field between `password` and `text` | ✅ |
| 7 | **💾 Save Changes** | `:3652` | ✅ Writes the edited record back — **and deliberately blanks the password**: `{ ...editingAdmin, password: '' }` | ✅ |

### Add modal

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 8 | ✕ / Cancel | `:3667`, `:3731` | Closes | ✅ |
| 9 | **👁 password visibility** | `:3706` | Toggles masking | ✅ |
| 10 | **✅ Create Admin** | `:3734` | ✅ Builds a full `AdminRecord` with `id: Date.now()`, `status: 'Active'`, `lastLogin: 'Just now'`, and **auto-assigns the permission set from the chosen role** | ✅ |

```ts
// :3745–3748 — permissions derived from role
permissions: role === 'Super Admin'
  ? { users: true,  reports: true, comments: true, analytics: true,  settings: true,  deleteAll: true }
  : role === 'Moderator'
  ? { users: true,  reports: true, comments: true, analytics: false, settings: false, deleteAll: false }
  : { users: false, reports: true, comments: true, analytics: false, settings: false, deleteAll: false };
```

Clean role→permission mapping, consistent with the three seeds.

---

## 3. 🔴 The permission system is decorative

Six permission flags are defined, stored, displayed, and derived from role on creation.
**Not one of them is ever read to gate anything.**

A grep for the permission keys outside `MOCK_ADMINS` and the creation handler returns no
authorisation checks. The console's *only* access control is `isSuperAdmin`
([02 §3](./02-dashboard-shell.md#3--the-role-gate)), which:

- Derives from a **URL query string**, not from the logged-in admin record
- Is used in **6 places**, only **2** of which enforce anything (user deletion)
- Has no connection whatsoever to `permissions.deleteAll`, `permissions.settings`, or any
  other flag

### 3.1 What that means in practice

| Scenario | Expected | Actual |
|---|---|---|
| Reviewer opens Settings (`settings: false`) | Blocked | ✅ Full access |
| Moderator views Analytics (`analytics: false`) | Blocked | ✅ Full access |
| Reviewer edits users (`users: false`) | Blocked | ✅ Full access |
| **Ops Moderator creates a Super Admin** | Blocked | ✅ **Allowed — this tab has no role guard at all** |
| Anyone deletes an admin (`deleteAll: false`) | Blocked | ✅ Allowed |

**This tab is where the console's security model is most visibly hollow**: it is a UI for
managing privileges in a system that has no privilege enforcement, and it is itself
unguarded. A user arriving at `/admin/dashboard` with no login is a Super Admin and can
create more admins.

---

## 3A. Add-admin validation — the strongest form in the console

```ts
// :3733 — the submit gate
disabled={
  !newAdmin.name ||
  !newAdmin.email ||
  !newAdmin.password ||
  newAdmin.password !== newAdmin.confirmPassword ||
  newAdmin.password.length < 8
}
```

| # | Rule | Status |
|---|---|---|
| 1 | Name required | ✅ |
| 2 | Email required | ✅ |
| 3 | Password required | ✅ |
| 4 | **Password must match confirmation** | ✅ |
| 5 | **Password minimum 8 characters** | ✅ |
| 6 | Email format check | ❌ `a@` passes — no regex, no `type="email"` |
| 7 | Duplicate-email check | ❌ Two admins can share an address |
| 8 | Password complexity | ❌ `12345678` passes |
| 9 | Error messages | ❌ None — the button is simply disabled, with no explanation of which rule failed |

**5 of 9 rules enforced — the most validation anywhere in either product.** For comparison,
the entire mobile app validates in only four places
([mobile 25 §2.1](../mobile/25-forms-validation-and-cross-cutting.md#21-validation-exists-in-exactly-four-places)),
and mobile's Edit Profile has **14 inputs with zero validation**.

⚠️ **The Edit modal has none of this.** Save Changes (`:3652`) carries no `disabled` prop
and no checks, so an admin created under all five rules can then be edited into a record
with a blank name and email. See gap #7.

---

## 4. Password handling

| Aspect | Behaviour |
|---|---|
| Field on the record | `password: string`, plaintext |
| Seeded values | `''` on all three |
| On **edit** | Explicitly blanked — `{ ...editingAdmin, password: '' }` (`:3653`) |
| On **create** | ⚠️ **Stored as typed** — `password: newAdmin.password` (`:3742`) |
| Hashing | None |
| Confirm field | `confirmPassword` — ✅ **compared against `password`** in the submit gate (`:3733`) |
| Visibility toggles | Both modals have them (`:3620`, `:3706`) |

One inconsistency remains: **editing scrubs the password while creating keeps it**.

None of this reaches a real auth system — logging in still only accepts the two hardcoded
pairs from `admin/page.tsx`. **A created admin cannot log in.**

---

## 5. Audit Logs

Documented with the Platform group —
[07 §5](./07-platform-settings.md#5-audit-logs-3217--read-only).

Summary as it relates to this tab: `MOCK_AUDIT_LOGS` (`:268`, 5 records) tracks
`admin · action · module · oldVal · newVal · time · ip`, and **nothing writes to it**.
Creating an admin, suspending one, or deleting one appends no entry — so the console's most
privileged actions leave no trace, in the same file that defines a permission matrix.

---

## 6. Mobile ↔ Admin connection

**None, and none expected.** Admin accounts are console-only; the mobile app has no admin
concept.

The one indirect link: `MOCK_ADMINS[0]` and `[1]` mirror the hardcoded login credentials,
so this table is the closest thing to an account store — and it is not the source the login
page checks.

| | Login page | This tab |
|---|---|---|
| Accounts | 2 hardcoded string pairs | 3 records |
| `review1@uthavu.org` | ❌ Unknown | ✅ Listed |
| Newly created admins | ❌ Cannot log in | ✅ Appear in the list |
| Source of truth | `admin/page.tsx:25–27` | `MOCK_ADMINS` |

Two account stores that don't agree.

---

## 7. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Permissions are never enforced.** Six flags, stored and displayed, read by nothing. | A Reviewer has identical power to a Super Admin. The permission matrix is a picture of a security model. | Gate every action on the logged-in admin's flags, server-side. |
| 2 | **The Admins tab has no role guard.** | An Ops Moderator — or an unauthenticated visitor — can create a Super Admin account. Privilege escalation by design. | Require `permissions.deleteAll` / Super Admin; enforce server-side. |
| 3 | **Created admins can't log in.** The login page checks two hardcoded pairs (`admin/page.tsx:25–27`), not this list. | The tab appears to manage access and manages nothing. | One account store, server-side. |
| 4 | **`review1@uthavu.org` has no way in.** | A seeded role that cannot be used. | Add it to the account store. |
| 5 | **Passwords are plaintext**, kept on create (`:3742`), blanked on edit (`:3653`). | Inconsistent, and unhashed either way. | Never store plaintext; hash server-side. |
| 6 | **Passwords are never hashed.** Create stores the plaintext value on the record (`:3742`). | Even as mock data this models the wrong pattern. | Hash server-side; never hold plaintext client-side. |
| 7 | **Create is validated; edit is not.** The Add modal gates on 5 rules (`:3733`), but the Edit modal's Save (`:3652`) has **no `disabled` prop and no checks** — it will write an admin with a blank name or email. | Inconsistent: the same record can be created safely and then edited into an invalid state. | Apply the same gate to Save Changes. |
| 8 | **Admin actions aren't audited.** Create, suspend and delete append nothing to Audit Logs. | The most sensitive actions in the console are untracked. | Log every mutation. |
| 9 | **`lastLogin` is a static string** — `'Just now'` on create, never updated. | Cannot tell which admin accounts are dormant. | Set on real login. |
| 10 | **All changes are lost on refresh.** | Admin management is ephemeral. | Persist. |

---

## 8. What works well

- **`AdminRecord` is properly typed** — one of only two interfaces in 4,888 lines, with
  union types for `role` and `status` rather than loose strings.
- **Role → permissions mapping on create** (`:3745`) is clean and matches the seeds exactly,
  so a new Moderator gets precisely the Ops Admin permission set.
- **Edit copies the record** (`:3534`) — `setEditingAdmin({ ...a })` — so cancelling
  genuinely discards changes rather than leaving a half-mutated row.
- **Delete asks for confirmation** (`:3545`) with a native `confirm()` naming the admin.
  Only two destructive actions in the console confirm; this is one of them.
- **Password visibility toggles** in both modals — a small, real usability touch.
- **Saving an edit deliberately blanks the password** (`:3653`), showing awareness that
  passwords shouldn't persist in client state.

---

## 9. QA checklist

- [ ] Three admins listed with role badges and permission indicators.
- [ ] "+ Add Admin" opens a blank form defaulting to Reviewer.
- [ ] Creating with role Moderator auto-assigns users/reports/comments and denies the rest.
- [ ] Creating with an **empty name and email** still succeeds (gap #7).
- [ ] Entering mismatched password and confirmation still succeeds (gap #6).
- [ ] A newly created admin **cannot log in** at `/admin` (gap #3).
- [ ] Edit → change a field → Cancel — the list is unchanged.
- [ ] Edit → Save — the row updates and the password field is blanked.
- [ ] Suspend flips the status badge.
- [ ] Remove shows a native confirm naming the admin; cancelling keeps the row.
- [ ] **With `?role=ops`, confirm "+ Add Admin" is still available** and can create a Super Admin (gap #2).
- [ ] After creating and deleting admins, check Audit Logs — **no new entries** (gap #8).
- [ ] Refresh — all changes gone.

---

## 10. Changing this tab

| To change… | Edit |
|---|---|
| Admin records | `:159` — `MOCK_ADMINS` |
| Record shape | `:140` — `AdminRecord` |
| Role → permission mapping | `:3745–3748` |
| Create handler | `:3734` |
| Edit save | `:3652` |
| Delete + confirm | `:3545` |
| Login account store (separate!) | `apps/web/src/app/admin/page.tsx:25–27` |

---

**Previous:** [08 — Monetization](./08-monetization.md) · **Next:** [10 — Unreachable tabs](./10-unreachable-tabs.md)
