# 26 — Field validation reference (every form in the app)

Complete field-by-field reference for **all 12 forms** in the mobile app — add forms, edit
forms and post/create flows — with mandatory status, validation, error message, default
value and submit behaviour.

**Line refs valid as of:** 2026-08-18
**Method:** exhaustive grep of `apps/mobile/src` for `<TextInput>`, `.test(`, `disabled=`,
`maxLength`, `keyboardType`, `.trim()` guards and `*` markers. Nothing sampled.

---

## Summary

| Metric | Count |
|---|---|
| Forms | **12** |
| `<TextInput>` fields | **34** across 11 screens |
| Fields explicitly marked mandatory (`*`) | **2** |
| …of those, actually enforced | **1** |
| Fields with any validation | **6 of 34** |
| Submit buttons with a `disabled` gate | **5 of 12** |
| Forms that show an error message | **3 of 12** |
| Forms with a `KeyboardAvoidingView` | **0** |

---

## Mandatory fields — the complete list

Only **two** fields in the entire app carry a required marker:

| Field | Screen | Marker | Enforced? |
|---|---|---|---|
| **Full Name** | [06 Profile Setup](./06-profile-setup-screen.md) `:136` | `placeholder="Full Name *"` | ❌ **No** — Complete Profile is never disabled and `handleComplete` has no check |
| **Email Address** | [10 Report Flow](./10-report-flow-screen.md) modal `:340` | `<Text>Email Address *</Text>` | ✅ **Yes** — regex-validated with an inline error |

Fields explicitly marked **optional**: Profession, Organization (Profile Setup / Edit
Profile), Landmark (Report Flow).

**Every other field — 30 of 34 — is unmarked**: neither required nor optional. A user has
no way to tell what is needed.

---

## Form 1 — Login (auth) · [doc 03](./03-login-screen.md)

| Field | Required | Type | Validation | Error | Default | Submit |
|---|---|---|---|---|---|---|
| Mobile number `:30` | Implicit | `phone-pad`, `maxLength 10` | Strips non-digits; `length >= 10` | ❌ None | `''` | `disabled={!isValid}` ✅ |

❌ **No 6–9 prefix check** — `5123456789` and `0000000000` both pass. Full analysis:
[03 §1A](./03-login-screen.md#1a-mobile-number-validation--requirement-vs-implementation).

## Form 2 — OTP (auth) · [doc 04](./04-otp-screen.md)

| Field | Required | Type | Validation | Error | Default | Submit |
|---|---|---|---|---|---|---|
| 6 digit boxes `:49` | Yes | `number-pad`, `maxLength 1` | `/[^0-9]/` rejected per box | ❌ None | `['','','','','','']` | `disabled={!isComplete}` ✅ |

❌ **The code is never checked.** `000000` proceeds. No expiry, no "Invalid OTP", no
"OTP expired". Full analysis: [04 §1A](./04-otp-screen.md#1a-otp-validation--requirement-vs-implementation).

## Form 3 — Profile Setup (**add**) · [doc 06](./06-profile-setup-screen.md)

| Field | Required | Type | Validation | Default |
|---|---|---|---|---|
| **Full Name** `:134` | **Marked `*`** | text, `autoCapitalize="words"` | ❌ **None** | `''` |
| Email `:147` | Optional | `email-address` | ❌ None | `''` |
| City `:162` | Unmarked | text | ❌ None | `''` |
| Language `:172` | Unmarked | text | ❌ None | `''` |
| Profession `:183` | "(Optional)" | picker | n/a | `null` |
| Other profession `:199` | Conditional | text | ❌ None | `''` |
| Organization `:213` | "(Optional)" | text | ❌ None | `''` |
| Show profession `:226` | — | `Switch` | n/a | `true` |

**Submit `:237` — no `disabled` prop, no checks.** An entirely empty form saves and
navigates. The `*` on Full Name is decorative.

## Form 4 — Edit Profile (**edit**) · [doc 20](./20-edit-profile-screen.md)

**14 fields. Zero required markers. Zero validation.**

| Field | Type | Validation |
|---|---|---|
| Full Name `:190` | text | ❌ |
| Email `:200` | `email-address`, no autocap | ❌ **No regex** — `..` saves |
| Address `:205` · City `:211` · State `:221` | text | ❌ |
| **Pincode** `:215` | **`numeric`** | ❌ No length check — `1` or `12345678901` save |
| Profession `:232` / Other `:249` / Organization `:260` | picker / text | ❌ |
| Languages `:367` · Blood Group `:376` · Skills `:387` | text | ❌ |
| **Emergency Contact** `:397` | text | ❌ **Not even numeric** — `hello` saves |
| Bio `:408` | multiline | ❌ No length cap |
| Phone | display only | ⚠️ Read-only **and omitted from the save payload** |
| 6 privacy switches `:281–351` | `Switch` | n/a |
| 8 interest chips `:431` | toggle | n/a |

**Submit `:455` — no `disabled` prop, no checks.** Writes 21 fields verbatim, then alerts
*"Profile and privacy settings saved successfully!"*.

> **The largest form in the app has the least validation.** The email regex it needs
> already exists 10 files away at `ReportFlowScreen.js:98`.

## Form 5 — Report Flow (**add / post**) · [doc 10](./10-report-flow-screen.md)

| Field | Required | Validation | Blocks publish? |
|---|---|---|---|
| Category `:122` | Implied | ❌ None | ❌ **No — and no category makes the gate pass** |
| Title `:136` | Unmarked | ❌ None | ❌ |
| Description `:145` | Unmarked | ❌ None | ❌ |
| Photo `:157` | "Recommended" | ❌ Cannot be attached | ❌ |
| Urgency `:173` | — | default `Medium` | ❌ |
| **Landmark** `:202` | "(Optional)" | ⚠️ **Uncontrolled — input discarded** | ❌ |
| **Expiry window** `:211` | Implied | ✅ `exceedsMax()` + presence | ✅ **The only gate** |
| 3 privacy switches | — | n/a | ❌ |

**Step 1 button `:312` — never disabled.** Step 2 — `disabled={step === 2 && !canPublish}`.
**2 of 13 fields validated.** Full matrix: [10 §4.2](./10-report-flow-screen.md#42-validation-matrix--every-field-in-the-report).

## Form 6 — Complete Profile modal (inside Report Flow) · [doc 10](./10-report-flow-screen.md)

| Field | Required | Validation | Error |
|---|---|---|---|
| **Email** `:341` | **Marked `*`** | ✅ `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (`:98`) | ✅ **Inline error shown** |
| Agreement checkbox `:358` | Yes | ⚠️ Checked at `:103` | ❌ **Silent** — `return` with no message; button dimmed but **not `disabled`** |

**The only mobile form with a working inline error message.**

## Form 7 — Post Update (**post**) · [doc 14](./14-request-details-screen.md)

| Field | Required | Validation | Submit |
|---|---|---|---|
| Update text `:846` | Yes | ✅ `!newUpdateText.trim()` | ✅ **`disabled={!newUpdateText.trim()}`** (`:894`) **plus** a guard return at `:197` |
| Type chip ×4 `:793` | — | default `location` | — |
| Resolution ×3 `:821` | — | default | — |
| Photo `:859` | Optional | ⚠️ Sets a hardcoded Unsplash URL | — |

✅ **Double-guarded** — both a disabled button and a handler guard. The only form in the app
that does both.

## Form 8 — Report Post to Admin (flag) · [doc 14](./14-request-details-screen.md)

| Field | Required | Validation |
|---|---|---|
| Reason radio ×7 `:1289` | Yes | ✅ Always valid — defaults to "Fake / Misleading" |

Cannot be submitted empty by construction.

## Form 9 — Mission completion (**post**) · [doc 15](./15-volunteer-journey-screen.md)

| Field | Required | Validation | Submit |
|---|---|---|---|
| Completion note `:464` | Unmarked | ❌ **None** | `:467` — **no `disabled`, no checks** |
| Proof photo | Rule 1 says required | ❌ **Not requested at all** | — |

⚠️ Pre-filled with a full narrative, so it never looks empty. A mission closes with no
evidence.

## Form 10 — Mission chat (**post**) · [doc 15](./15-volunteer-journey-screen.md)

| Field | Required | Validation |
|---|---|---|
| Message `:505` | Yes | ✅ `if (chatInput.trim())` guard at `:513` — empty send is a silent no-op |

⚠️ Guard only, no `disabled` prop — the button looks active on an empty field.

## Form 11 — Support ticket (**add**) · [doc 21](./21-settings-screen.md)

| Field | Required | Validation | Error |
|---|---|---|---|
| Type chip ×6 `:248` | — | default "Technical Problem" | — |
| **Subject** `:260` | Yes | ✅ `.trim()` | ✅ `Alert.alert('Required Fields', …)` |
| **Description** `:268` | Yes | ✅ `.trim()` | ✅ Same alert |

✅ **The only mobile form that names its required fields in an error message.** Submit has
no `disabled` prop — it validates on press instead.

## Form 12 — Search / filter inputs (not validation)

| Field | Screen | Behaviour |
|---|---|---|
| Search requests `13:456` | Category List | Live filter, no validation |
| Location search `08:355` | Dashboard | Filters Popular Areas only |

---

## Cross-form findings

| # | Finding | Evidence |
|---|---|---|
| 1 | **The only `*`-marked field that isn't enforced is Full Name** — the first thing a new user fills in | ProfileSetup `:136` vs `:237` |
| 2 | **Add and Edit disagree.** Profile Setup marks Full Name required; Edit Profile marks nothing and validates nothing | Forms 3 & 4 |
| 3 | **Post forms are better validated than profile forms.** Post Update is double-guarded; Edit Profile has 14 unvalidated fields | Forms 4 & 7 |
| 4 | **One email regex exists and is used once.** `ReportFlowScreen.js:98` — Edit Profile and Profile Setup both accept anything | Forms 3, 4, 6 |
| 5 | **3 of 12 forms show an error.** Report email (inline), Support ticket (alert), and OTP's non-existent one | — |
| 6 | **`maxLength` on 2 of 34 fields.** Bio, skills, description and notes are unbounded | Login, OTP only |
| 7 | **No form has a `KeyboardAvoidingView`** | 0 across the app |
| 8 | **Emergency Contact accepts letters** — a safety field with no numeric keyboard or check | EditProfile `:397` |
| 9 | **Pincode has a numeric keyboard but no length check** | EditProfile `:215` |

---

## Recommended minimum per form

| Form | Add |
|---|---|
| Login | `/^[6-9]\d{9}$/` + inline error |
| OTP | Server verification, expiry, two error messages |
| Profile Setup | Enforce Full Name; disable submit until valid |
| **Edit Profile** | Email regex · pincode `/^\d{6}$/` · emergency contact numeric · bio `maxLength` |
| Report Flow | Require category + title; include both in `canPublish` |
| Email modal | `disabled={!agreed}` so the checkbox failure isn't silent |
| Mission completion | Require a captured photo (Rule 1) |
| Chat | `disabled` on empty, matching Post Update |

---

**Previous:** [25 — Forms, validation & cross-cutting](./25-forms-validation-and-cross-cutting.md) · **Back to** [index](./README.md)
