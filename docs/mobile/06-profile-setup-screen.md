# 06 — Profile Setup Screen

> **Screen 6 of the mobile app — the last step before the main app.** Collects name, email,
> city, language, profession and organisation, then writes them to `UserContext` (which
> persists to AsyncStorage) and lands the user on the tab bar.
>
> This is the **first screen in the entire flow that actually saves data.**

| | |
|---|---|
| **Route name** | `ProfileSetup` |
| **Source file** | `apps/mobile/src/screens/ProfileSetupScreen.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/App.js:61–65` |
| **Entry animation** | `slide_from_right` |
| **Arrives from** | `Permissions` (via `replace`) |
| **Navigates to** | `MainTabs` (via `replace`) — both Complete and Skip |
| **Writes data** | ✅ `updateUser()` → AsyncStorage `@uthavu_user_profile_v2` |
| **Talks to admin web** | No (but this is the data the admin *Users* table shows) |

---

## 1. Layout

```
┌──────────────────────────────┐
│ [‹]   Set up Profile   [Skip] │  header — back, title, skip pill
├──────────────────────────────┤
│           ╭─────╮            │
│           ┆ 📷  ┆⊕           │  avatar 72 dp, dashed border, + badge
│           ╰─────╯            │
│       Add profile photo      │  12 / #64748B
│                              │
│  ┌────────────────────────┐  │
│  │ 👤 Full Name *         │  │  44 dp tall, icon left
│  ├────────────────────────┤  │
│  │ ✉  Email Address (opt) │  │
│  ├───────────┬────────────┤  │
│  │ 📍 City   │ 🌐 Language│  │  side by side, flex 1 each
│  ├───────────┴────────────┤  │
│  │ 💼 Profession (Opt)  ⌄ │  │  opens a bottom-sheet modal
│  ├────────────────────────┤  │
│  │ 🏢 Organization (Opt)  │  │
│  └────────────────────────┘  │
│  Show profession on public   │  ○──● native Switch
│                              │
│  ┌────────────────────────┐  │
│  │   Complete Profile     │  │  always enabled
│  └────────────────────────┘  │
└──────────────────────────────┘
```

No images. Ten lucide icons: `Camera`, `ChevronLeft`, `Check`, `User`, `Mail`, `MapPin`,
`Globe`, `Briefcase`, `Building2`, `ChevronDown`, `X`.

---

## ⚡ Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Back button `‹`** | `:52` | `navigation.goBack()` — ⚠️ **lands on the OTP screen**, not Permissions, because Permissions was replaced | — | `Otp` |
| 2 | **"Skip" pill** | `:56` | ⚠️ **Writes a blank profile** — empty name/city/language, `email: null`, `interests: []` — persists it, then leaves | Overwrites the whole profile | `MainTabs` (**replace**) |
| 3 | **Avatar circle / 📷 / ⊕ badge** | `:119` | ❌ **Nothing — no `onPress` handler at all.** No image picker is installed. "Add profile photo" is decoration | — | — |
| 4 | Full Name field | `:134` | Text input, `autoCapitalize="words"`. Marked `*` but **not enforced** | `name` | — |
| 5 | Email field | `:147` | Text input, email keyboard, no validation | `email` | — |
| 6 | City field | `:162` | Text input | `city` | — |
| 7 | Language field | `:172` | Text input — ⚠️ saved to a key nothing reads (see gap #4) | `language` | — |
| 8 | **Profession row** | `:183` | Opens the bottom-sheet picker | `profPickerOpen` → true | — |
| 9 | Profession option ×18 | `:89` | Selects that profession **and closes the sheet immediately** | `profession`, `profPickerOpen` → false | — |
| 10 | Sheet **✕** close | `:78` | Closes the sheet without changing the selection | `profPickerOpen` → false | — |
| 11 | Android back while sheet is open | `:72` | Closes the sheet (`onRequestClose`) ✅ handled correctly | `profPickerOpen` → false | — |
| 12 | "Enter your profession" field | `:199` | Only exists when profession = **Other** | `professionOther` | — |
| 13 | Organization field | `:213` | Text input | `organization` | — |
| 14 | "Show profession on public profile" switch | `:226` | Native `Switch`, defaults **on**. Controls whether the Profile screen renders the profession pill | `showProfession` | — |
| 15 | **"Complete Profile"** | `:237` | Saves 9 fields via `updateUser()` → AsyncStorage, then leaves. ❌ **Always enabled** — no disabled state, no validation, so an entirely empty form is accepted | Writes the profile | `MainTabs` (**replace**) |

> #2 and #15 both end on `MainTabs`. The difference is what they write: Complete saves what
> you typed; Skip saves emptiness over the top of it.

---

## 2. Fields

| # | Field | State | Placeholder | Required? | Saved as |
|---|---|---|---|---|---|
| 1 | Photo | — | "Add profile photo" | No | **nothing — not wired** (gap #3) |
| 2 | Full Name | `name` | `Full Name *` | Marked `*`, **not enforced** (gap #2) | `name` |
| 3 | Email | `email` | `Email Address (optional)` | No | `email` — `null` if blank |
| 4 | City | `city` | `City` | No | `city` |
| 5 | Language | `language` | `Language` | No | `language` ⚠️ (gap #4) |
| 6 | Profession | `profession` | `Profession (Optional)` | No | `profession` (id string) |
| 7 | Other profession | `professionOther` | `Enter your profession` | Only shown when profession = `other` | `professionOther` |
| 8 | Organization | `organization` | `Organization (Optional)` | No | `organization` |
| 9 | Show profession publicly | `showProfession` | — | Defaults **on** | `showProfession` |

### 2.1 Profession picker

Tapping the Profession row opens a bottom-sheet `<Modal>` (`animationType="slide"`,
`transparent`) listing all 18 entries from `PROFESSIONS` in
`apps/mobile/src/context/UserContext.js:116–135`:

> 🚫 None / Clear · 👨‍💻 Software Engineer · 👩‍⚕️ Doctor · 👨‍⚕️ Nurse · 👮 Police ·
> 🚒 Fire & Rescue · 🚑 Paramedic · 👩‍🏫 Teacher · 👨‍🔧 Mechanic · ⚡ Electrician ·
> 🛠 Plumber · 🚚 Driver · 🌾 Farmer · 🎓 Student · 🏢 Business Owner · 🏠 Homemaker ·
> ❤️ Volunteer · ✍️ Other

Selecting one sets the id and closes the sheet immediately. The selected row gets an
`#ECFDF5` background, `#10B981` bold label and a filled check circle.

`PROFESSIONS` is the shared canonical list — the same array powers `EditProfileScreen` and
every profile card, so ids stay consistent across the app.

---

## 3. Visual specification

From `ProfileSetupScreen.js:250–471`.

> 🚨 **`COLORS` is imported on line 10 and never used.** Like the Permissions screen, every
> colour here is a raw literal, and the CTA is `#10B981` rather than the brand `#16A34A`.
> See gap #7.

### 3.1 Header

| Element | Spec |
|---|---|
| Container | row, `space-between`, `paddingHorizontal: 16`, `paddingVertical: 10` |
| Back button | `34 × 34`, `borderRadius: 10`, bg `#F8FAFC`, border `1` `#E2E8F0`, `ChevronLeft` 20 `#0F172A` |
| Title | `16` / `700` / `#0F172A` |
| Skip pill | `paddingHorizontal: 12`, `paddingVertical: 6`, `borderRadius: 12`, bg `#F1F5F9`, text `13`/`600`/`#64748B` |

### 3.2 Avatar

| Element | Spec |
|---|---|
| Circle | `72 × 72`, `borderRadius: 36`, bg `#F8FAFC`, border **`1.5` dashed `#CBD5E1`** |
| Icon | `Camera` 24, `#64748B` |
| Badge | `22 × 22` circle, bg `#10B981`, white `+` 14/700, `2` white border, bottom-right |
| Label | `12` / `500` / `#64748B`, `marginTop: 6` |

### 3.3 Inputs

Every field shares one `inputBox` style — a `44` dp tall row with the icon inside.

| Property | Value |
|---|---|
| Height | `44` |
| Background | `#F8FAFC` |
| Border | `1` solid `#E2E8F0` |
| Radius | `12` |
| Icon | `16` dp, `#94A3B8`, `marginLeft: 12`, `marginRight: 6` |
| Text | `13.5` / `#0F172A` |
| Placeholder | `#94A3B8` |
| Field gap | `8` (`formGroup`) |

City and Language share a row with `gap: 8`, each `flex: 1`.

### 3.4 Toggle & CTA

| Element | Spec |
|---|---|
| Toggle label | `12` / `500` / `#475569` |
| `Switch` track | off `#E2E8F0` · on `#10B981` · thumb `#FFFFFF` |
| Primary button | bg `#10B981`, `borderRadius: 14`, `paddingVertical: 14`, text `#FFFFFF` 15/700 |

There is **no disabled state** — unlike Login and OTP, the CTA is always green and always
pressable.

### 3.5 Profession modal

| Element | Spec |
|---|---|
| Overlay | `rgba(0,0,0,0.4)`, content bottom-aligned |
| Sheet | `#FFFFFF`, top corners `20`, `maxHeight: '70%'` |
| Sheet header | title `15`/`700`, close button `28 × 28` circle bg `#F1F5F9` with `X` 18 |
| Option row | `paddingHorizontal: 18`, `paddingVertical: 12`, `gap: 12`, bottom border `#F8FAFC` |
| Option — selected | bg `#ECFDF5`, label `#10B981` bold, `18 × 18` green check circle |
| Option icon | emoji at `18` |
| Option label | `13.5` / `#334155` |

---

## 4. Functionality

### 4.1 Saving — "Complete Profile"

```js
// ProfileSetupScreen.js:31–44
const handleComplete = () => {
  updateUser({
    name:            name.trim(),
    email:           email.trim() || null,
    city:            city.trim(),
    language:        language.trim(),
    interests:       [],
    profession:      profession,
    professionOther: professionOther.trim(),
    organization:    organization.trim(),
    showProfession:  showProfession,
  });
  navigation.replace('MainTabs');
};
```

`updateUser` (from `UserContext`) shallow-merges this over the current profile and
immediately persists the whole object to AsyncStorage under `@uthavu_user_profile_v2`.
It is synchronous from the caller's perspective — the write is fire-and-forget, and
navigation happens without awaiting it.

### 4.2 Saving — "Skip"

Skip is **not** a no-op. It writes a blanked-out profile:

```js
// ProfileSetupScreen.js:58–61
updateUser({ name: '', email: null, city: '', language: '', interests: [],
             profession: null, organization: '', showProfession: true });
navigation.replace('MainTabs');
```

`UserContext.INITIAL_USER_STATE` ships with demo values (`name: 'Hari'`,
`email: 'hari@example.com'`, `city: 'Anna Nagar, Chennai'`, `profession: 'software_engineer'`…).
Skipping **overwrites those with empty strings and persists them**, so the user lands in the
app with a blank profile rather than the seeded demo one. See gap #5.

### 4.3 Field-level behaviour

- All text values are `.trim()`ed before saving.
- Email saves as `null` when blank — `email.trim() || null` — which is what
  `UserContext.hasEmail()` checks for.
- `interests: []` is written unconditionally by **both** paths, so any previously stored
  interests are wiped here.
- The "Other" text field only mounts when `profession === 'other'` (`:196`).

### 4.4 Navigation

```
Permissions ──replace──▶ ProfileSetup ──replace──▶ MainTabs
                              │
                       goBack() ⚠️ lands on Otp, not Permissions
```

Stack trace through the flow:

| After | Stack contents |
|---|---|
| `Onboarding → replace(Login)` | `[Login]` |
| `Login → navigate(Otp)` | `[Login, Otp]` |
| `Otp → navigate(Permissions)` | `[Login, Otp, Permissions]` |
| `Permissions → replace(ProfileSetup)` | `[Login, Otp, ProfileSetup]` ← Permissions is gone |

So the back button on this screen pops to **Otp** — an empty 6-digit form — not to
Permissions. See gap #1.

---

## 5. Mobile ↔ Admin web connection

**No API call.** Data stops at AsyncStorage on the device.

This screen is nevertheless the origin of most of what the admin console displays. The
mock user rows in `apps/web/src/app/admin/dashboard/page.tsx:63–70` have exactly these
fields:

| Admin column | Set here? | Source |
|---|---|---|
| `name` | ✅ | Full Name |
| `email` | ✅ | Email |
| `city` / `district` | ⚠️ partly | City (one free-text field; admin has two columns) |
| `profession` | ✅ | Profession picker (admin stores the **label**, mobile stores the **id**) |
| `phone` | ❌ | Would come from Login (never captured) |
| `avatar` / `photo` | ❌ | Photo upload not wired (gap #3) |
| `joined`, `lastLogin`, `device`, `status` | ❌ | Server-side, needs a backend |

Two mismatches to resolve before wiring: **city vs. city+district**, and
**profession id (`'software_engineer'`) vs. label (`'Software Engineer'`)**. `PROFESSIONS`
in `UserContext.js` is the map between them and should be shared via `libs/shared`.

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Back button goes to the OTP screen.** `Permissions` used `replace`, so it's no longer in the stack; `goBack()` pops to `Otp`. | Pressing back mid-setup dumps the user on an empty verification form with no way forward except re-entering a code. Confusing dead end. | Remove the back button (setup is terminal), or use `navigation.replace('Permissions')`. |
| 2 | **"Full Name *" is marked required but nothing enforces it.** No validation in `handleComplete`, and the CTA has no disabled state. | A user can complete setup with a completely empty profile — same result as Skip. The asterisk is a lie. | Gate the button on `name.trim().length > 0`, matching the Login/OTP disabled pattern. |
| 3 | **Photo upload does nothing.** The avatar `TouchableOpacity` (`:119`) has **no `onPress`**. No image picker is installed. | "Add profile photo" with a `+` badge is tappable-looking and completely inert. `avatarUri` in the user model is never set. | `npx expo install expo-image-picker`, wire the handler, save to `avatarUri`. **Full spec — size, dimensions, format, compression, permissions: [20 §2A](./20-edit-profile-screen.md#2a-profile-photo-upload--full-specification)** |
| 4 | **Field name mismatch: `language` vs `languagesSpoken`.** This screen writes `language`; `UserContext.INITIAL_USER_STATE` defines `languagesSpoken` (`UserContext.js:16`), which is what Edit Profile and the profile cards read. | The language typed here is stored under a key nothing reads — it silently vanishes from the UI while `languagesSpoken` keeps its default `'English, Tamil'`. | Rename to `languagesSpoken` here (or add a migration). |
| 5 | **Skip destroys the seeded profile.** It persists empty strings over `INITIAL_USER_STATE`. | The user lands in the app with a blank profile. Also inconsistent: the Skip payload omits `professionOther`, so a stale value can survive. | Skip should navigate without writing anything. |
| 6 | **`interests: []` is written unconditionally.** | Wipes any stored interests on every completion, including a re-run. | Only set `interests` when the screen actually collects them. |
| 7 | **`COLORS` imported but unused; wrong green.** `import { COLORS } from '../theme'` on line 10 is dead. The CTA, badge, switch and check circles all use `#10B981` instead of `#16A34A`. | Same divergence as the Permissions screen — two different greens in one app. | Use `COLORS.primaryGreen` throughout, or delete the unused import. |
| 8 | **`Platform` imported but unused** (`:4`). | Dead import; lint noise. | Remove. |
| 9 | **No scrolling on the form.** The content is a plain `View` with `flex: 1`; only the modal scrolls. | With the keyboard open — or when the "Other" field appears and adds a 7th row — fields and the CTA can be pushed off-screen with no way to reach them on a small device. | Wrap in `ScrollView` + `KeyboardAvoidingView`. |
| 10 | **No email validation.** Any string is accepted. | Garbage emails persist. | Regex-validate when non-empty. |
| 11 | **"None / Clear" behaves like a profession.** Selecting it stores `'none'` and the field then displays "🚫 None / Clear" as if chosen. | Slightly odd — though `getProfessionLabel()` does correctly treat `'none'` as null downstream. | Map `'none'` → `null` on select and reset the field to its placeholder. |
| 12 | **Mixed StatusBar APIs.** `react-native`'s `StatusBar` here (`:2`, `:48`) vs `expo-status-bar` in `App.js`. | Same conflict as screen 05. | Standardise on `expo-status-bar`. |
| 13 | **Nothing is sent to a server.** Profile lives only on the device. | Reinstalling loses everything; the admin console can never see this user. | `POST /users/me` alongside the local write. |
| 14 | **No labels, only placeholders.** Once a field is filled, its meaning disappears. | Standard placeholder-as-label accessibility problem. | Add visible labels or `accessibilityLabel`. |

---

## 6A. What works well

- **This is one of only two real write paths in the app.** `updateUser()` persists 21 fields
  to AsyncStorage under `@uthavu_user_profile_v2` — the other being
  [20 — Edit Profile](./20-edit-profile-screen.md).
- **Every text field is trimmed before saving** (`:33–40`) — `name.trim()`, `city.trim()`,
  `organization.trim()`, and `email.trim() || null` correctly stores *absent* rather than an
  empty string.
- **The status bar is set explicitly** (`:48`).
- **Optional fields are marked optional** rather than silently accepting blanks.

---

## 7. QA checklist

- [ ] Filling every field and tapping Complete Profile lands on the tab bar.
- [ ] Force-quit and relaunch — the saved name/city/profession are still there
      (proves the AsyncStorage write).
- [ ] The language typed here shows up on the Profile screen (blocked by gap #4).
- [ ] Selecting **Other** reveals the extra text field; selecting anything else hides it.
- [ ] The profession sheet scrolls through all 18 options and closes on select and on ✕.
- [ ] The selected profession shows its check circle when the sheet is reopened.
- [ ] Complete Profile with an empty name — should be blocked (blocked by gap #2).
- [ ] Skip does not blank an existing profile (blocked by gap #5).
- [ ] Tapping the avatar opens an image picker (blocked by gap #3).
- [ ] With the keyboard open on a small device, the CTA is still reachable (gap #9).
- [ ] Back button behaves sensibly (blocked by gap #1).

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Add/remove a field | Add state at `:17–27`, a row in the form, and a key in `handleComplete` (`:32–42`) |
| Profession list | `apps/mobile/src/context/UserContext.js:116–135` — shared with Edit Profile |
| Make name required | `handleComplete` (`:31`) + add a `disabled` style on the CTA (`:237`) |
| Where Complete goes | `:43` |
| Skip behaviour | `:58–61` |
| Field styling | `styles.inputBox` / `styles.input` (`:344–363`) |
| Modal appearance | `styles.pickerSheet` and below (`:410–470`) |

---

**Previous:** [05 — Permissions](./05-permissions-screen.md) · **Next:** [07 — Main Tabs](./07-main-tabs.md)

---

## 🏁 End of the onboarding & auth flow

Screens 01–06 cover everything from cold start to the main app. Summary of what actually
persists by the time a user reaches `MainTabs`:

| Data | Captured on | Persisted? |
|---|---|---|
| Phone number | 03 Login | ❌ Never stored, never passed on |
| OTP / session | 04 OTP | ❌ No verification, no token |
| Location & notification consent | 05 Permissions | ❌ Discarded on unmount |
| Name, email, city, profession, organisation | 06 Profile Setup | ✅ AsyncStorage `@uthavu_user_profile_v2` |
| Language | 06 Profile Setup | ⚠️ Written to an unread key (gap #4) |
| Profile photo | 06 Profile Setup | ❌ Not wired |

**The user reaches the app with no identity and no session** — only a locally stored
profile. Auth is a UI prototype end to end.
