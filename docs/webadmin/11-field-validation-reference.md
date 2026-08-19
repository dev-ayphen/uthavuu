# 11 — Field validation reference (every form in the console)

Field-by-field reference for **all 11 forms** in the admin console, with mandatory status,
validation, error message, default value and submit behaviour.

**Line refs valid as of:** 2026-08-18
**Method:** exhaustive grep of `apps/web/src/app/admin` for `<input>`, `<textarea>`,
`<select>`, `required`, `disabled=`, `.trim()` guards and `*` markers. Nothing sampled.

---

## Summary

| Metric | Count |
|---|---|
| Forms | **11** |
| Input controls | **72** (69 dashboard + 3 login) |
| Fields marked mandatory (`*` or `required`) | **18** |
| …of those, actually enforced | **7** |
| Submit buttons with a `disabled` gate | **3 of 11** |
| Forms that show an error message | **1 of 11** |

---

## Mandatory fields — the complete list

| Form | Field | Marker | Enforced? |
|---|---|---|---|
| Admin login | Admin Email | `required` | ✅ Browser-native + `type="email"` |
| Admin login | Password | `required` | ✅ Browser-native |
| Broadcast | Title | `required` | ✅ Native + `if (!bannerTitle.trim()) return` |
| Broadcast | Message | `required` | ✅ Native |
| Notifications *(unreachable)* | Title | `required` | ⚠️ Guarded (`:741`) but the tab can't be opened |
| Notifications *(unreachable)* | Message | `required` | ⚠️ Same |
| Add Admin | Name · Email · Password | — | ✅ All three in the `disabled` gate (`:3733`) |
| **Sponsor wizard** | **9 fields marked `*`** | `*` in the label | ❌ **None enforced** — see §Form 8 |

**18 marked, 7 enforced.** The 9 unenforced are all in the sponsor wizard.

---

## Form 1 — Admin login · [doc 01](./01-admin-login.md)

| Field | Required | Type | Validation | Error | Default | Submit |
|---|---|---|---|---|---|---|
| Admin Email `page.tsx:123` | ✅ `required` | `type="email"` | ✅ **Browser-native** — blocks empty and malformed before JS runs | ✅ Inline banner on wrong credentials | `''` | `disabled={loading}` |
| Password `:137` | ✅ `required` | `type="password"` | ✅ Browser-native | ✅ Same banner | `''` | — |
| Remember Me `:149` | — | checkbox | n/a — **value never read** | — | `false` | — |

✅ **The only form in either product using native HTML validation.** Stronger than any
mobile screen — see [mobile 26](../mobile/26-field-validation-reference.md).

## Form 2 — Add Category · [doc 07](./07-platform-settings.md)

| Field | Required | Validation | Default | Submit |
|---|---|---|---|---|
| Category Name `:2461` | Implicit | ✅ `if (!newCatName.trim()) return` (`:737`) | `''` | Form `onSubmit`, no `disabled` |

❌ Icon, image, colour, description and content are **not captured at all** — see
[07 §1.3](./07-platform-settings.md#13--add-category-captures-a-name-and-nothing-else).

## Form 3 — Broadcast compose · [doc 05](./05-community.md)

| Field | Required | Validation | Default |
|---|---|---|---|
| Title `:2710` | ✅ `required` | ✅ Native + `.trim()` guard (`:764`) | `''` |
| Message `:2715` | ✅ `required` | ✅ Native | `''` |
| Type | — | `select` | Feeds the derived `category` |
| Target District | — | `select` | — |

✅ **The most complete flow in the console** — validation, role attribution, optimistic
prepend, form reset, and a live mobile preview.

## Form 4 — Support reply · [doc 07](./07-platform-settings.md)

| Field | Required | Validation | Submit |
|---|---|---|---|
| Reply textarea `:3082` | Unmarked | ❌ **None** | ⚠️ Marks Resolved — **the text is discarded** (`adminReplyText` never read) |

## Form 5 — App Settings (35 keys + 11 dead toggles) · [doc 07](./07-platform-settings.md)

| Field group | Validation | Persist |
|---|---|---|
| Number inputs — `expiryHours`, `maxVolunteers`, `maxPhotos`, `flagLimit` | ❌ No min/max — negatives and zero accepted | ❌ |
| Text inputs — `appName`, `appVersion`, `supportPhone`, `supportEmail`, `website` | ❌ No format checks — `supportEmail` accepts anything | ❌ |
| **3 keyed toggles** — `commentsEnabled`, `flagEnabled`, `allowAnonymous` (`:3316–3318`) | n/a | ❌ Reverts on refresh |
| **11 unkeyed toggles** (`:3355–3357`, `:3381–3385`, `:3410–3412`) | n/a | 🔴 **No state and no `onClick`** — clicking does nothing at all. ON/OFF is computed from the array index |

❌ **"Save All Settings" is an `alert()`** — the 35 stateful keys revert on refresh, and the
11 decorative toggles never held a value to begin with. See
[07 §2A](./07-platform-settings.md#2a--eleven-toggles-on-this-tab-are-decorative--no-state-no-handler).

## Form 6 — Add Admin ✅ · [doc 09](./09-admins-and-audit.md#3a-add-admin-validation--the-strongest-form-in-the-console)

| Field | Required | Validation |
|---|---|---|
| Name | ✅ | ✅ In the gate |
| Email | ✅ | ✅ Present — ❌ **no format check** (`a@` passes) |
| Password | ✅ | ✅ Present **+ minimum 8 characters** |
| Confirm Password | ✅ | ✅ **Must equal Password** |
| Role | — | `select`, default `Reviewer` |
| Phone | Unmarked | ❌ None |

```ts
// :3733 — 5 rules in one gate
disabled={!newAdmin.name || !newAdmin.email || !newAdmin.password ||
          newAdmin.password !== newAdmin.confirmPassword ||
          newAdmin.password.length < 8}
```

✅ **The strongest form in either product.** ❌ No error text — the button is simply
disabled, with no indication of which rule failed.

## Form 7 — Edit Admin ⚠️ · [doc 09](./09-admins-and-audit.md)

| Field | Validation |
|---|---|
| All fields | ❌ **None** |

⚠️ Save Changes (`:3652`) has **no `disabled` prop and no checks**. An admin created under
Form 6's five rules can be edited into a record with a blank name and email.

## Form 8 — Add Sponsor wizard ⚠️ · [doc 08](./08-monetization.md)

**Six steps, 9 fields marked `*` — and not one is enforced.**

| Step | Field | Marked | Enforced |
|---|---|---|---|
| 1 | **Sponsor Name** | `*` | ❌ Falls back to `'New Sponsor'` |
| 1 | **Organization Name** | `*` | ❌ Never read on publish |
| 1 | **Sponsor Category** | `*` | ⚠️ `select`, defaults `Food Donation` |
| 1 | Contact Person · Contact Email · Contact Phone · Website | — | ❌ No format checks |
| 1 | **Campaign Name** | `*` | ❌ Hardcoded to `'New Campaign'` on publish |
| 1 | Sponsorship Value (₹) | — | ❌ No numeric validation |
| 2 | **Sponsor Logo** | `*` | ❌ Published as `logo: ''` |
| 2 | **Creative Type** | `*` | ⚠️ Defaults `banner` |
| 2 | Upload Video / Banner | — | ⚠️ **Simulated** — no file picker |
| 3 | **Headline** | `*` | ❌ Not read |
| 3 | Description | — | ❌ Hardcoded to `'A new sponsor campaign'` |
| 3 | **CTA Button** · **CTA URL** | `*` | ❌ Not read; no URL validation |
| 3 | Ad Label | — | Default `Sponsored` |
| 4 | 4 placement toggles | — | ✅ Read |
| 5 | Start / End date | — | ❌ No range check — end can precede start |
| 6 | Preview + Publish | — | ❌ **No gate** |

```ts
// :4583 — Publish ignores most of the form
name: newSponsorName || 'New Sponsor',
description: 'A new sponsor campaign',        // ← hardcoded
campaignName: 'New Campaign',                 // ← hardcoded, despite being marked *
logo: '',                                     // ← marked * , published empty
```

❌ **Next → never validates** (`:4615`) — a user can click through all six steps without
typing anything and publish a campaign named "New Sponsor".

> **9 mandatory markers, 0 enforcement, and 3 of the marked fields are overwritten by
> hardcoded strings at publish.** The worst requirement-vs-implementation gap in either
> product.

## Form 9 — Edit Sponsor · [doc 08](./08-monetization.md)

| Field | Validation |
|---|---|
| All | ❌ None. Save writes the copy back unchecked |

## Form 10 — Notifications compose *(unreachable)* · [doc 10](./10-unreachable-tabs.md)

| Field | Required | Validation |
|---|---|---|
| Title `:2854` | ✅ `required` | ✅ `if (!notifTitle.trim()) return` (`:741`) |
| Message `:2858` | ✅ `required` | ✅ Native |

⚠️ Correctly validated — but **the tab has no route in**, so the form can never be opened.

## Form 11 — Search / filter inputs (not validation)

| Field | Tab | Behaviour |
|---|---|---|
| User search `:1160` | Users | Live filter on name **or email** — ❌ not phone |
| Report search `:1568` | Reports | Live filter on title or reporter |

---

## Cross-form findings

| # | Finding |
|---|---|
| 1 | **The console's best-validated form and its worst sit in the same file.** Add Admin enforces 5 rules; the sponsor wizard marks 9 fields mandatory and enforces none |
| 2 | **Add is validated, Edit is not** — true for both admins and sponsors |
| 3 | **Only 1 of 11 forms shows an error message** (admin login). Everywhere else a disabled button is the only feedback |
| 4 | **No email format validation anywhere** — Add Admin, sponsor contact, and `supportEmail` all accept `a@` |
| 5 | **No number bounds** — settings accept negatives; sponsorship value accepts anything |
| 6 | **The only correctly-validated compose form is unreachable** (Form 10) |
| 7 | **Native HTML validation is used on exactly one form** (login) — the cheapest win available everywhere else |

---

## Comparison — mobile vs admin

| | Mobile | Admin |
|---|---|---|
| Forms | 12 | 11 |
| Input controls | 34 | 72 |
| Mandatory markers | **2** | **18** |
| Enforced | 1 | 7 |
| Forms with a `disabled` gate | 5 | 3 |
| Forms showing an error | 3 | 1 |
| Native HTML validation | n/a (RN) | 1 form |
| Strongest form | Report-email modal (regex + inline error) | **Add Admin** (5 rules) |
| Weakest form | Edit Profile (14 fields, 0 validation) | **Sponsor wizard** (9 `*`, 0 enforced) |

Full mobile detail: [mobile 26](../mobile/26-field-validation-reference.md).

---

**Previous:** [10 — Unreachable tabs](./10-unreachable-tabs.md) · **Back to** [index](./README.md)
