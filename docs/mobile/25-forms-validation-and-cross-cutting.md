# 25 — Forms, validation & cross-cutting behaviour

> App-wide audit of things that span every screen: **every form and its validation**,
> **theme / dark mode**, **events**, and the systemic patterns that are either present
> everywhere or missing everywhere.
>
> Compiled by grepping the whole of `apps/mobile/src` — the counts here are exhaustive, not
> sampled.

**Line refs valid as of:** 2026-08-18

---

## 1. Is there an "events" feature?

**No.** A case-insensitive grep for `event` across `apps/mobile/src` returns **three
matches, none of them a product feature**:

| Match | File | What it actually is |
|---|---|---|
| `scrollEventThrottle={16}` | `ImpactStoryScreen.js:217` | Carousel scroll tuning |
| `pointerEvents="box-none"` | `SponsorCard.js:99` | Touch pass-through on a video overlay |
| `pointerEvents="box-none"` | `SponsorCard.js:207` | Same |

There is **no events, campaigns, drives or meetups feature** in the mobile app — no screen,
no route, no data array, no menu entry. The admin console has no events tab either.

The nearest concepts that *do* exist are **help requests** (one-off, user-created,
[10 — Report Flow](./10-report-flow-screen.md)) and **missions** (a request a volunteer has
accepted, [15 — Volunteer Journey](./15-volunteer-journey-screen.md)). Neither is scheduled,
recurring, or multi-attendee in the way an "event" would be.

> If community events are wanted, this is greenfield — nothing exists to build on.

---

## 2. Every form in the app

**34 `<TextInput>` across 11 screens.** (The OTP screen counts as 1 in source but renders 6
boxes via `.map()`.)

| Screen | Inputs | Validation | Blocks submit? |
|---|---|---|---|
| [03 Login](./03-login-screen.md) | 1 | ✅ Digits-only strip + `length >= 10` (`:11`, `:35`) | ✅ Button `disabled` |
| [04 OTP](./04-otp-screen.md) | 6 boxes | ✅ Digit regex `/[^0-9]/` (`:21`) | ✅ Button `disabled` until all 6 filled |
| [06 Profile Setup](./06-profile-setup-screen.md) | 6 | ❌ **None** — "Full Name *" is marked required and never enforced | ❌ Always enabled |
| [10 Report Flow](./10-report-flow-screen.md) | 4 | ⚠️ **2 of 13 fields validated** — expiry window + modal email (`:98`). Category, title, description, landmark and photo all unchecked. Full matrix: [10 §4.2](./10-report-flow-screen.md#42-validation-matrix--every-field-in-the-report) | ⚠️ Only the expiry window; step 1's button is never disabled |
| [14 Request Details](./14-request-details-screen.md) | 1 | ⚠️ `if (!newUpdateText.trim()) return` — silent, no message | ⚠️ Silent no-op |
| [15 Volunteer Journey](./15-volunteer-journey-screen.md) | 2 | ❌ None on the completion note or chat | ❌ |
| [20 Edit Profile](./20-edit-profile-screen.md) | **14** | ❌ **None on any of the 14** | ❌ Always enabled |
| [21 Help & Support](./21-settings-screen.md) | 2 | ✅ Both required, with an explicit alert (`:46`) | ✅ Returns early |
| [13 Category List](./13-category-list-screen.md) | 1 | n/a — live search filter | n/a |
| [08 Dashboard](./08-dashboard-screen.md) | 1 | n/a — location search filter | n/a |
| `MapScreen.js` (orphaned) | 1 | n/a | n/a |

> **Field-by-field detail for all 12 forms — mandatory status, error messages, submit
> behaviour — is in [26 — Field validation reference](./26-field-validation-reference.md).**

### 2.1 Validation exists in exactly four places

```js
OtpScreen.js:21        if (/[^0-9]/.test(value)) return;              // digit-only
LoginScreen.js:11      const isValid = phone.length >= 10;            // length
ReportFlowScreen.js:98 /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)     // email
SettingsScreen.js:46   if (!subject.trim() || !message.trim()) …      // required fields
```

**That is the complete list.** Everything else accepts anything.

### 2.2 The gap that matters most

**[20 — Edit Profile](./20-edit-profile-screen.md) has 14 inputs and zero validation** —
including `email`, `pincode` and `emergencyContact`. All are `.trim()`ed and persisted to
AsyncStorage verbatim. A pincode of `abc`, an email of `..`, and an emergency contact of
`hello` all save successfully and show a *"Profile and privacy settings saved
successfully!"* alert.

The email regex needed already exists in `ReportFlowScreen.js:98` and isn't reused.

### 2.3 Input hygiene

| Property | Count | Notes |
|---|---|---|
| `maxLength` | **2 of 34** | Only Login (`10`) and OTP (`1`). Bio, skills and description are unbounded |
| `keyboardType` | **7 of 34** | 2 email-address, 2 phone-pad, 1 number-pad, 1 numeric, 1 email+autocap. The other 27 get a default QWERTY |
| `autoCapitalize` | 6 | Correctly `none` on emails, `words` on names |
| `multiline` | 5 | Description, bio, completion note, ticket message, chat |
| `secureTextEntry` | **0** | No password field exists anywhere — auth is OTP-only |
| `placeholderTextColor` | Inconsistent | Set on the setup/edit screens, omitted on the auth screens |

### 2.4 File / photo upload

**No upload exists anywhere in the app.** Grepping `apps/mobile/src` for `maxSize`,
`fileSize`, `mimeType`, `quality`, `compress`, `allowsEditing` and `aspect` returns **zero
matches**, and no picker dependency is installed (`expo-image-picker`, `expo-camera`,
`expo-file-system`, `expo-image` — none in `package.json`).

| Photo entry point | Screen | State |
|---|---|---|
| Avatar + ⊕ badge | [06 Profile Setup](./06-profile-setup-screen.md) `:119` | No `onPress` at all |
| Avatar action sheet | [20 Edit Profile](./20-edit-profile-screen.md) `:165`, `:175` | Both options are `() => {}` |
| "Take Photo" / "Upload" | [10 Report Flow](./10-report-flow-screen.md) `:159`, `:163` | No `onPress`; preview is a static PNG |
| "Attach photo" | [14 Request Details](./14-request-details-screen.md) `:190` | Sets a hardcoded Unsplash URL, alerts success |
| Completion proof | [15 Volunteer Journey](./15-volunteer-journey-screen.md) `:467` | Not required despite Rule 1 |

**Five entry points, zero captures.** The only upload limit defined in the whole repo is the
admin console's `maxPhotos: 4` per report (`admin/dashboard/page.tsx:650`), which mobile
never reads.

Recommended constraints — count, MB, dimensions, format, compression, permissions — are in
[20 §2A](./20-edit-profile-screen.md#2a-profile-photo-upload--full-specification).

### 2.5 Toggles

**14 `<Switch>` across 4 screens:**

| Screen | Switches | Persist? | Have any effect? |
|---|---|---|---|
| [06 Profile Setup](./06-profile-setup-screen.md) | 1 | ✅ | ✅ `showProfession` |
| [20 Edit Profile](./20-edit-profile-screen.md) | 6 | ✅ | ⚠️ **Only 1 of 6** — `showProfession` |
| [21 Help & Support](./21-settings-screen.md) | 4 | ❌ | ❌ **None** |
| [10 Report Flow](./10-report-flow-screen.md) | 3 | ❌ | ⚠️ Anonymous correctly force-disables phone sharing; none is saved |

**Of 14 toggles in the app, exactly one changes anything a user can observe.**

Plus the two fake permission rows on [05 — Permissions](./05-permissions-screen.md), which
are `TouchableOpacity` rather than `Switch` and request nothing from the OS.

---

## 3. Dark mode / light mode

**Dark mode does not exist and cannot work.** Three independent blockers:

| Blocker | Evidence |
|---|---|
| The app is pinned to light | `app.json:8` — `"userInterfaceStyle": "light"` |
| No theme system | `theme.js` exports one flat `COLORS` object. No dark variant, no theme provider, no context |
| Nothing reads the system theme | **0 uses of `useColorScheme`** or `Appearance` across `apps/mobile/src` |

The only dark-mode surface is a switch:

```js
// SettingsScreen.js:16
const [darkMode, setDarkMode] = useState(false);
// SettingsScreen.js:187
<Switch value={darkMode} onValueChange={setDarkMode} trackColor={{ true: COLORS.primaryGreen }} />
```

It flips a local boolean that nothing reads, and resets on unmount. See
[21 gap #3](./21-settings-screen.md#5-gaps--known-issues).

### 3.1 The one place system appearance leaks in

```js
// App.js:122
<StatusBar style="auto" />
```

`"auto"` follows the **device** theme, not the app's. On a phone set to light mode, dark
status-bar icons render on the splash screen's dark green background — low contrast. See
[01 gap #4](./01-splash-screen.md#7-gaps--known-issues).

[08 — Dashboard](./08-dashboard-screen.md#22-status-bar-handling--done-correctly) is the
only screen that handles this properly, scoping `light-content` to focus via
`useFocusEffect` and reverting on blur.

### 3.2 What building dark mode would take

1. Remove `"userInterfaceStyle": "light"` from `app.json`
2. Split `theme.js` into `lightColors` / `darkColors` and add a `ThemeProvider`
3. Replace the **~500 raw hex literals** scattered across screens with token references —
   see [24 §Design tokens](./24-utils-and-dead-code.md) and the adherence table in the
   [index](./README.md#design-tokens). This is the real cost: several screens define their
   own palettes
4. Fix `<StatusBar style="auto" />` to follow the app theme
5. Persist the choice in `UserContext`

Steps 1, 2, 4 and 5 are a day's work. **Step 3 is the project.**

---

## 4. Profile — the three screens

Profile data is spread across three screens with different completeness:

| Screen | Fields | Validation | Persists |
|---|---|---|---|
| [06 Profile Setup](./06-profile-setup-screen.md) | 9 written | ❌ None | ✅ AsyncStorage |
| [12 Profile (view)](./12-profile-screen.md) | Reads 4 | n/a | — |
| [20 Edit Profile](./20-edit-profile-screen.md) | **21 written** | ❌ None | ✅ AsyncStorage |

Known inconsistencies between them:

| Issue | Detail |
|---|---|
| **Key mismatch** | Setup writes `language`; Edit Profile writes `languagesSpoken` — the key everything else reads. Setup's value is invisible |
| **Interests wiped** | Setup force-writes `interests: []` on both Complete *and* Skip; Edit Profile preserves them |
| **Skip is destructive** | Setup's Skip overwrites the seeded profile with empty strings |
| **Phone unreachable** | Displayed on Edit Profile, has no setter, omitted from the save payload |
| **Photo missing** | Setup's avatar has no handler at all; Edit Profile's opens an action sheet whose options are `() => {}` |
| **Stats fabricated** | The view screen shows "32 helps / 96% reliability" as literals beside real context data |

---

## 5. Settings — there is no settings screen

The route named `Settings` renders a screen titled **"Help & Support"**
([21](./21-settings-screen.md)). It mixes a support-ticket desk with four preference
toggles, and **two different Profile menu items both open it**
([12](./12-profile-screen.md) #13 and #16).

Genuine app settings are scattered:

| Setting | Where it actually lives | Works? |
|---|---|---|
| Push notifications | 21 (local toggle) | ❌ |
| Emergency alerts | 21 (local toggle) | ❌ |
| Location sharing | 21 (local toggle) | ❌ |
| Dark mode | 21 (local toggle) | ❌ |
| Profile visibility | 21 — an `Alert` stating a value, no control | ❌ |
| Language | 21 — an `Alert` listing options, not selectable | ❌ |
| Clear cache | 21 — an `Alert` claiming success | ❌ |
| **Privacy controls (6)** | **20 Edit Profile** | ⚠️ 1 of 6 |
| Search radius | 08 Dashboard modal | ✅ |
| Report expiry window | 10 Report Flow | ✅ |

**Every toggle on the Settings screen is inert; the settings that work live on other
screens.**

---

## 6. Systemic gaps — present in zero screens

Counted across all of `apps/mobile/src`:

| Pattern | Count | Consequence |
|---|---|---|
| **`KeyboardAvoidingView`** | **0** | 34 inputs, none protected. On short devices the keyboard covers the submit button — Login and Profile Setup pin their CTAs with `marginTop: 'auto'`, so both are reachable only by dismissing the keyboard |
| **`RefreshControl`** | **0** | No pull-to-refresh anywhere, on any list |
| **`ActivityIndicator` / `isLoading`** | **0** | No loading state exists. Nothing is async yet, so nothing shows one — but there is no pattern to follow when the API lands |
| **Error states** | 0 | No screen can display a failed request |
| **Empty states** | **2** | Only [11 Alerts](./11-alerts-screen.md) `:151` and [18 Mission Journal](./18-mission-journal-screen.md) `:227`. [09 My Helps](./09-my-helps-screen.md) and [13 Category List](./13-category-list-screen.md) render blank when their lists are empty |
| **`accessibilityLabel` / `accessibilityRole`** | **9 total** | Across 24 screens. All 9 are in just two files — `ExpiryPicker.js` (3) and `RequestDetailsScreen.js` (6). Every tab, every card, every switch elsewhere is unlabelled |
| **i18n library** | **0** | No i18n dependency. 11 hardcoded `உதவு` strings; all other copy is English, in a Tamil-named app for a Tamil-speaking audience |
| **Deep link config** | 0 | No `scheme` in `app.json`, so the invite and story links can't open the app |
| **`secureTextEntry`** | 0 | No password anywhere — correct for OTP auth |

### 6.1 Accessibility — the 9 props

| File | Line | Prop |
|---|---|---|
| `ExpiryPicker.js` | `:59`, `:60` | `accessibilityRole="button"`, label "Change how long this request stays open" |
| `ExpiryPicker.js` | `:94` | `accessibilityRole="radio"` |
| `RequestDetailsScreen.js` | `:383`, `:384` | button + "Open navigation in Google Maps" |
| `RequestDetailsScreen.js` | `:795`, `:823` | two `radio` roles |
| `RequestDetailsScreen.js` | `:927`, `:928` | button + "Open chat with the reporter" |

Both files show the right pattern. Nothing else in the app follows it — most notably the
**Report FAB**, the app's primary action, which has `tabBarLabel: ''` and no
`tabBarAccessibilityLabel` ([07 gap #5](./07-main-tabs.md#8-gaps--known-issues)).

---

## 7. Priority summary

| # | Issue | Scope | Effort |
|---|---|---|---|
| 1 | **Edit Profile: 14 inputs, no validation** | 1 screen | Low — the email regex already exists at `ReportFlowScreen.js:98` |
| 2 | **13 of 14 toggles do nothing** | 4 screens | Medium — needs the settings to be real, not just stored |
| 3 | **No `KeyboardAvoidingView` anywhere** | 11 screens | Low — a wrapper per form screen |
| 4 | **Only 2 empty states** | 4+ lists | Low |
| 5 | **9 accessibility props app-wide** | Everywhere | Medium |
| 6 | **No i18n in a Tamil-branded app** | Everywhere | High |
| 7 | **Dark mode blocked by ~500 raw hexes** | Everywhere | High — do the token migration first |
| 8 | **No loading or error states** | Everywhere | Blocks the API work; decide the pattern before wiring |

---

**Previous:** [24 — Utils & dead code](./24-utils-and-dead-code.md) · **Next:** [26 — Field validation reference](./26-field-validation-reference.md)
