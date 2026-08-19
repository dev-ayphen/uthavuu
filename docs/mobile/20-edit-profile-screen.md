# 20 — Edit Profile (stack)

> **The full profile editor** — 17 fields across basic info, professional info, six privacy
> toggles and an interests picker. **Everything here genuinely persists to AsyncStorage.**
>
> The most complete and most correct data screen in the app.

| | |
|---|---|
| **Route name** | `EditProfile` |
| **Source file** | `apps/mobile/src/screens/EditProfileScreen.js` (583 lines) |
| **Registered in** | `apps/mobile/App.js:96–100` |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Profile card or "Edit Profile" pill |
| **Navigates to** | `goBack()` only |
| **Context used** | ✅ `useUser()` — reads `user`, writes via `updateUser()` |
| **Writes data** | ✅ **21 fields → AsyncStorage `@uthavu_user_profile_v2`** |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ ‹   Edit Profile              [Save]   │
├────────────────────────────────────────┤
│            ╭─────╮                     │
│            │  H  │📷                   │  tap → photo action sheet
│            ╰─────╯                     │
│ BASIC INFORMATION                      │
│  Full Name    [Hari                  ] │
│  Email        [hari@example.com      ] │
│  Address      [4th Main Road         ] │
│  City [Chennai]  Pincode [600040]      │
│  State        [Tamil Nadu            ] │
│ PROFESSIONAL INFORMATION               │
│  Profession   [👨‍💻 Software Engineer ⌄] │
│  Organization [Uthavu Community      ] │
│ PRIVACY CONTROLS                       │
│  Show name publicly              [●──] │
│  Show profession                 [●──] │
│  Show photo publicly             [●──] │
│  Show community stats            [●──] │
│  Allow volunteers to call        [●──] │
│  Allow volunteers to email       [──○] │
│ ADDITIONAL DETAILS                     │
│  Languages [English, Tamil] Blood [O+] │
│  Skills       [First Aid, Driving…   ] │
│  Emergency    [+91 98765 00000       ] │
│  Bio          [                      ] │
│ INTERESTED HELP CATEGORIES             │
│  (🐶 Animal)(❤️ Medical)(🍱 Food)…     │
│ ┌────────────────────────────────────┐ │
│ │            Save Changes            │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

## 2. Interaction map — every tap target

### Header & photo

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 1 | **Back `‹`** | `:103` | Returns to Profile **discarding unsaved edits** — no "unsaved changes" warning | — |
| 2 | **"Save" (header)** | `:107` | Saves everything — identical to #33 | Writes profile |
| 3 | **Avatar circle** | `:175` | Opens a native action sheet: *Take Photo* / *Choose from Gallery* / Cancel | — |
| 4 | **📷 badge** | `:165` | ❌ **Same action sheet as #3** — duplicate trigger | — |
| 5 | ↳ "Take Photo" | `:166` | ❌ **Empty handler — `onPress: () => {}`.** Nothing happens | — |
| 6 | ↳ "Choose from Gallery" | `:167` | ❌ **Empty handler** | — |

### Fields

| # | Element | Line | Type | Saves to |
|---|---|---|---|---|
| 7 | Full Name | `:190` | text | `name` |
| 8 | Email | `:200` | email keyboard, no autocapitalise | `email` (`null` if blank) |
| 9 | Address | `:205` | text | `address` |
| 10 | City | `:211` | text | `city` |
| 11 | Pincode | `:215` | **numeric** keyboard | `pincode` |
| 12 | State | `:221` | text | `state` |
| 13 | **Profession row** | `:232` | opens the picker sheet | `profession` |
| 14 | Profession option ×18 | `:135` | selects and closes | `profession` |
| 15 | Picker ✕ | `:123` | closes, no change | — |
| 16 | "Other" profession | `:249` | text — only when profession = `other` | `professionOther` |
| 17 | Organization | `:260` | text | `organization` |
| 18 | Languages Spoken | `:367` | text | `languagesSpoken` ✅ |
| 19 | Blood Group | `:376` | text | `bloodGroup` |
| 20 | Skills & Certifications | `:387` | text | `skills` |
| 21 | Emergency Contact | `:397` | text | `emergencyContact` |
| 22 | Bio | `:408` | multiline | `bio` |
| 23 | **Phone** | — | ❌ **Displayed but read-only** — state has no setter (`:26`), and it is **omitted from the save payload** | — |

### Privacy toggles — all six persist

| # | Switch | Line | Default | Effect |
|---|---|---|---|---|
| 24 | Show name publicly | `:281` | on | `showNamePublicly` |
| 25 | **Show profession** | `:295` | on | `showProfession` — ✅ **genuinely controls the pill on [12 — Profile](./12-profile-screen.md)** via `getProfessionLabel()` |
| 26 | Show photo publicly | `:309` | on | `showPhotoPublicly` |
| 27 | Show community stats | `:323` | on | `showCommunityStats` |
| 28 | Allow volunteers to call | `:337` | on | `allowVolunteersCall` |
| 29 | Allow volunteers to email | `:351` | **off** | `allowVolunteersEmail` |

> Only #25 has an observable effect anywhere in the app. The other five are stored
> faithfully and read by nothing. See gap #2.

### Interests & save

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 30 | **Interest chip ×8** | `:431` | Toggles membership — add if absent, remove if present. Multi-select | `selectedInterests` |
| 31 | **"Save Changes"** | `:455` | Same as #2 | Writes profile |
| 32 | ↳ on save | `:89` | `Alert.alert('Success', 'Profile and privacy settings saved successfully!')` then `goBack()` | — |

---

## 2A. Profile photo upload — full specification

> **Short answer: there are no limits, because there is no upload.** No count, no MB cap, no
> dimensions, no format restriction, no compression. None of it exists anywhere in
> `apps/mobile`.

### 2A.1 What exists today

| Element | Line | State |
|---|---|---|
| Avatar circle (tappable) | `:175` | Opens an action sheet |
| 📷 badge (tappable) | `:165` | Opens the **same** action sheet |
| "Take Photo" option | `:166` | `onPress: () => {}` — **empty function** |
| "Choose from Gallery" option | `:167` | `onPress: () => {}` — **empty function** |
| Cancel | `:168` | Dismisses |
| Storage field | `UserContext.js:20` | `avatarUri: null` — **declared, never written by any screen** |

The avatar renders the first letter of the user's name. There is no code path that can
change it.

### 2A.2 Every upload constraint in the codebase

Grepped across `apps/mobile/src` for `maxSize`, `fileSize`, `mimeType`, `quality`,
`compress`, `allowsEditing`, `aspect`:

**Zero matches.** No constraint of any kind is defined on the mobile side.

The **only** upload limit anywhere in the repo is in the admin console — and it is for
report photos, not profile photos:

| Setting | Value | Where | Read by mobile? |
|---|---|---|---|
| `maxPhotos` | **4** | `admin/dashboard/page.tsx:650`, UI label *"Maximum Photos Per Report"* (`:3310`) | ❌ No |
| `imageModeration` | toggle | same settings object | ❌ No |
| "Mission Completion Photos Required" | toggle | `:3357` | ❌ No |

So: **4 photos per report** is defined server-side and ignored by the app — which can't
attach a real photo anyway ([10 gap #3](./10-report-flow-screen.md#7-gaps--known-issues),
[14 gap #3](./14-request-details-screen.md#5-gaps--known-issues)). **Profile photos have no
limit defined at all.**

### 2A.3 No dependency is installed

```
expo-image-picker   ❌ not in package.json
expo-camera         ❌ not in package.json
expo-file-system    ❌ not in package.json
expo-image          ❌ not in package.json
```

Nothing can read, resize, compress or upload an image today.

### 2A.4 What the admin console expects to receive

`MOCK_USERS` (`admin/dashboard/page.tsx:62`) stores two separate things per user:

| Field | Example | Meaning |
|---|---|---|
| `avatar` | `https://images.unsplash.com/photo-…?auto=format&fit=crop&**w=150&q=80**` | A **URL**, not a file — rendered at **150 px** wide, quality 80 |
| `photo` | `'👨‍💻'` | An emoji fallback |

Two implications for whatever gets built:

1. The app must upload to storage and persist a **URL**, not a local `file://` path.
   `avatarUri` currently holds neither.
2. The admin renders at **150 px**. Anything larger than ~300 px (2× for retina) is wasted
   bandwidth on that surface.

There is also an `onError` fallback to `https://ui-avatars.com/api/?name=…` (`:1226`,
`:1509`), so a broken URL degrades to a generated initial — the same idea as the app's
letter avatar.

### 2A.5 Recommended specification

Nothing below is implemented — this is the spec to build against.

| Constraint | Recommended value | Reasoning |
|---|---|---|
| **Count** | **1** | It's a profile photo. (Report photos are capped at 4 by `maxPhotos`.) |
| **Max file size** | **2 MB** before compression, **~200 KB** after | Users on 3G — a support ticket already in the admin mock data reads *"Image upload failed on slow 3G"* (`:298`) |
| **Output dimensions** | **512 × 512** square | 150 px in admin, 72 px on Profile Setup, 34–36 px elsewhere. 512 covers every surface at 3× |
| **Aspect ratio** | **1:1**, enforced by the cropper | Every avatar in the app is a circle |
| **Compression quality** | **0.7** | ~180 KB at 512², visually indistinguishable at avatar sizes |
| **Formats accepted** | JPEG, PNG, HEIC (iOS) | HEIC must be transcoded — `expo-image-picker` outputs JPEG by default |
| **Format stored** | **JPEG** | Smallest for photographic content |
| **Camera permission** | Required for "Take Photo" | Must be requested at the point of use — [05 — Permissions](./05-permissions-screen.md) requests nothing |
| **Library permission** | Required for "Choose from Gallery" | Same |
| **Upload target** | Object storage → persist the returned URL to `avatarUri` | Admin expects a URL |
| **Failure behaviour** | Keep the letter avatar, show a retry | Matches the admin's `ui-avatars` fallback |

**Size reference from this repo:** the 11 bundled PNGs in `apps/mobile/src/assets/` are all
1024 × 1024 and range **595 KB – 1.5 MB** (~9.4 MB total). An unconstrained camera capture
from a modern phone is **3–8 MB**. Without the compression step above, avatars would be
larger than every illustration in the app.

### 2A.6 Implementation sketch

```js
import * as ImagePicker from 'expo-image-picker';   // npx expo install expo-image-picker

const pickImage = async (fromCamera) => {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return Alert.alert('Permission needed', '…');

  const opts = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,      // opens the system cropper
    aspect: [1, 1],           // square
    quality: 0.7,             // ~180 KB at 512²
  };

  const res = fromCamera
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);

  if (res.canceled) return;
  // TODO: resize to 512×512, upload, then persist the returned URL — not the file:// uri
  updateUser({ avatarUri: res.assets[0].uri });
};
```

Wire it to **both** `:165` and `:175`, which currently open the same sheet with empty
handlers.

### 2A.7 Where else a photo is promised but missing

| Screen | Element | State |
|---|---|---|
| [06 Profile Setup](./06-profile-setup-screen.md) `:119` | Avatar + ⊕ badge | **No `onPress` at all** |
| [10 Report Flow](./10-report-flow-screen.md) `:159`, `:163` | "Take Photo" / "Upload" | No `onPress`; the preview is a static PNG |
| [14 Request Details](./14-request-details-screen.md) `:190` | "Attach photo" | Sets a **hardcoded Unsplash URL** and alerts "Proof photo attached successfully!" |
| [15 Volunteer Journey](./15-volunteer-journey-screen.md) `:467` | Completion submit | Requires no photo, despite Rule 1 mandating live-camera proof |

**Five photo entry points across the app. None captures an image.** Fixing the picker here
would supply four of the five.

---

## 3. What gets saved

```js
// :65–88 — updateUser() payload, 21 keys
{ name, email, address, city, state, pincode, bio, emergencyContact,
  languagesSpoken, bloodGroup, skills,
  profession, professionOther, organization,
  showNamePublicly, showProfession, showPhotoPublicly,
  showCommunityStats, allowVolunteersCall, allowVolunteersEmail,
  interests: selectedInterests }
```

All strings are `.trim()`ed; `email` becomes `null` when blank. `updateUser()` shallow-merges
and immediately persists the whole object to `@uthavu_user_profile_v2`.

**No validation of any kind** — no email regex, no pincode length check, no required
fields. The Save button is never disabled.

### 3.1 The `language` vs `languagesSpoken` fix

[06 — Profile Setup](./06-profile-setup-screen.md#6-gaps--known-issues) writes `language`,
a key nothing reads. **This screen writes `languagesSpoken`** (`:74`) — the key
`INITIAL_USER_STATE` actually defines (`UserContext.js:16`).

So the mismatch is one-directional: whatever a user types during setup is invisible until
they open this screen, which shows the default `'English, Tamil'` instead. Fixing screen 06
to write `languagesSpoken` resolves it.

---

## 4. Mobile ↔ Admin web connection

**None** — but this screen produces the richest user record in the app, and the admin
console displays a subset of it.

| Field here | Admin column (`MOCK_USERS`, `admin/dashboard/page.tsx:62`) |
|---|---|
| `name`, `email`, `city` | `name`, `email`, `city` |
| — | `district` — **admin has two location fields, mobile has one** |
| `profession` (id, e.g. `software_engineer`) | `profession` (**label**, e.g. `Software Engineer`) |
| `phone` (read-only here) | `phone` |
| `bloodGroup`, `skills`, `languagesSpoken`, `emergencyContact`, `bio`, `interests` | ❌ Not modelled admin-side |
| 6 privacy toggles | ❌ Not modelled admin-side |

Two mismatches would need resolving before any sync: **id vs label** for profession, and
**one city field vs city + district**. `PROFESSIONS` in `UserContext.js:116–135` is the map
between them and belongs in `libs/shared`.

Six privacy toggles that the admin cannot see is a compliance problem in itself — an
operator viewing a user has no way to know what that user consented to display.

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Photo upload is an empty action sheet.** Both options are `onPress: () => {}` (`:166–167`), and no image picker is installed. | The most-expected profile action opens a menu where both choices do nothing — worse than [06 gap #3](./06-profile-setup-screen.md#6-gaps--known-issues), where the button at least does nothing openly. | `npx expo install expo-image-picker`; write to `avatarUri`. |
| 2 | **Five of six privacy toggles are decorative.** Only `showProfession` is read anywhere. | Users set consent preferences that no screen honours. `allowVolunteersCall` in particular implies contact gating that doesn't exist. | Honour them in Request Details' contact flow and on the profile card. |
| 3 | **Phone is shown but can't be edited or saved** (`:26`, omitted from the payload). | The one field tied to identity is frozen at a hardcoded default, and it's the field the admin console keys users by. | Make it editable with re-verification, or label it read-only. |
| 4 | **No validation anywhere.** Email, pincode and emergency contact all accept any string. | Malformed data persists silently. | Validate email and pincode; disable Save when invalid. |
| 5 | **Unsaved changes are discarded without warning** (`:103`). | Editing 17 fields then tapping back loses everything. | Prompt on back when the form is dirty. |
| 6 | **Success alert fires before persistence is confirmed** (`:89`). `updateUser` triggers a fire-and-forget `AsyncStorage.setItem`; failures are only `console.warn`ed (`UserContext.js:64`). | "Saved successfully!" can appear when the write failed. | Await the write; surface errors. |
| 7 | **Nothing reaches a server.** | Profile is device-local; reinstalling loses it and the admin console can never see the user. | `PATCH /users/me`. |
| 8 | **Duplicate photo triggers** (#3 and #4) open the same sheet. | Harmless, but redundant. | Keep one. |
| 9 | **Unused imports:** `Shield`, `Eye`. | Dead weight. | Remove. |
| 10 | **36 raw hexes vs 31 tokens.** | Half-migrated. | Finish. |

---

## 6. What works well

- **Real persistence.** 21 fields written through `updateUser()` to AsyncStorage, surviving
  restarts. Along with [10](./10-report-flow-screen.md)'s email capture, this is one of only
  two genuine write paths in the entire app.
- **`showProfession` actually works end to end** — set here, honoured by
  `getProfessionLabel()`, visible on the Profile screen. The one complete
  privacy-control loop.
- **Shares `PROFESSIONS` with Profile Setup**, so profession ids stay consistent across
  both editors and every display card.
- **Correct `languagesSpoken` key**, unlike screen 06.
- **Consistent trimming**, and `email → null` matching what `hasEmail()` checks for.
- **Interests are add/remove chips** backed by a real array toggle (`:57–61`) — and unlike
  screen 06, which force-writes `interests: []`, this screen preserves them.

---

## 7. QA checklist

- [ ] Fields open pre-filled from the stored profile.
- [ ] Change the name → Save → Profile screen and Dashboard greeting reflect it *(Dashboard won't — see [08 gap #1](./08-dashboard-screen.md#9-gaps--known-issues))*.
- [ ] Force-quit and relaunch — every edited field survives.
- [ ] Turn off "Show profession" → the pill disappears from the Profile screen.
- [ ] Turn off the other five toggles → confirm nothing changes anywhere (gap #2).
- [ ] Tap the avatar → both action-sheet options do nothing (gap #1).
- [ ] Select "Other" profession → the free-text field appears.
- [ ] Toggle interest chips on and off; confirm they persist.
- [ ] Enter an invalid email → it saves anyway (gap #4).
- [ ] Edit several fields then tap back — changes are lost without warning (gap #5).
- [ ] The language typed in Profile Setup does **not** appear here (§3.1).

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Save payload | `:65–88` |
| Interests list | `:10` — `interestsList` |
| Profession list | `apps/mobile/src/context/UserContext.js:116–135` |
| Privacy toggles | `:281–351` |
| Photo action sheet | `:165–178` |
| Default phone | `:26` |

---

**Previous:** [19 — Flagged Requests](./19-flagged-screen.md) · **Next:** [21 — Help & Support](./21-settings-screen.md)
