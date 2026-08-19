# Uthavu Mobile App — Documentation

> ⚠️ **Not actually verified — see `docs/README.md` for the full correction.** `apps/mobile`
> doesn't exist in this repo. Every line ref in these 26 documents was fabricated by an earlier
> agent run, not read from real code.

**Codebase:** `apps/mobile` · package `@uthavu/mobile`
**Stack:** Expo SDK ~57.0.8 · React Native 0.86.0 · React 19.2.3 · React Navigation 7
**Entry:** `apps/mobile/index.js` → `apps/mobile/App.js`
**Line refs valid as of:** 2026-08-18

✅ **Complete — 26 documents + this index**, covering every screen, component and utility.

Each screen doc contains an **⚡ Interaction map**: every tap target, its line number, what
happens on tap, what state changes, and where it navigates. Dead targets are marked ❌ with
the reason.

---

## Part 1 — Onboarding & auth flow

| # | Screen | Route | Source | Doc |
|---|---|---|---|---|
| 01 | Splash | `Splash` | `SplashScreen.js` | [01](./01-splash-screen.md) |
| 02 | Onboarding | `Onboarding` | `OnboardingScreen.js` | [02](./02-onboarding-screen.md) |
| 03 | Login | `Login` | `LoginScreen.js` | [03](./03-login-screen.md) |
| 04 | OTP Verification | `Otp` | `OtpScreen.js` | [04](./04-otp-screen.md) |
| 05 | Permissions | `Permissions` | `PermissionsScreen.js` | [05](./05-permissions-screen.md) |
| 06 | Profile Setup | `ProfileSetup` | `ProfileSetupScreen.js` | [06](./06-profile-setup-screen.md) |

## Part 2 — Tab bar

| # | Screen | Route | Source | Doc |
|---|---|---|---|---|
| 07 | Main Tabs (shell) | `MainTabs` | `navigation/MainTabs.js` | [07](./07-main-tabs.md) |
| 08 | Dashboard | `DashboardTab` | `DashboardScreen.js` | [08](./08-dashboard-screen.md) |
| 09 | My Helps | `MyHelpsTab` | `MyHelpsScreen.js` | [09](./09-my-helps-screen.md) |
| 10 | Report Flow | `ReportTab` | `ReportFlowScreen.js` | [10](./10-report-flow-screen.md) |
| 11 | Alerts | `AlertsTab` | `AlertsScreen.js` | [11](./11-alerts-screen.md) |
| 12 | Profile | `ProfileTab` | `ProfileScreen.js` | [12](./12-profile-screen.md) |

## Part 3 — Stack screens

| # | Screen | Route | Source | Doc |
|---|---|---|---|---|
| 13 | Category List | `CategoryList` | `CategoryListScreen.js` | [13](./13-category-list-screen.md) |
| 14 | Request Details | `RequestDetails` | `RequestDetailsScreen.js` | [14](./14-request-details-screen.md) |
| 15 | Volunteer Journey | `VolunteerJourney` | `VolunteerJourneyScreen.js` | [15](./15-volunteer-journey-screen.md) |
| 16 | Impact Stories (list) | `ImpactStories` | `ImpactStoriesScreen.js` | [16](./16-impact-stories-screen.md) |
| 17 | Impact Story (detail) | `ImpactStory` | `ImpactStoryScreen.js` | [17](./17-impact-story-screen.md) |
| 18 | Mission Journal | `MissionJournal` | `MissionJournalScreen.js` | [18](./18-mission-journal-screen.md) |
| 19 | Flagged Requests | `Flagged` | `FlaggedScreen.js` | [19](./19-flagged-screen.md) |
| 20 | Edit Profile | `EditProfile` | `EditProfileScreen.js` | [20](./20-edit-profile-screen.md) |
| 21 | Help & Support | `Settings` ⚠️ | `SettingsScreen.js` | [21](./21-settings-screen.md) |
| 22 | Invite Friends | `InviteFriends` | `InviteFriendsScreen.js` | [22](./22-invite-friends-screen.md) |

## Part 4 — Shared layer

| # | Doc | Covers |
|---|---|---|
| 23 | [Shared components](./23-shared-components.md) | `ExpiryBadge`, `ExpiryPicker`, `ExpiredNotice`, `MissionSummary`, `VolunteerRoster`, `SponsorCard` |
| 24 | [Utils & dead code](./24-utils-and-dead-code.md) | `expiry.js`, `missions.js`, `savedStore.js` (dead), `MapScreen.js` (orphaned), `libs/shared` (dead) |
| 25 | [Forms, validation & cross-cutting](./25-forms-validation-and-cross-cutting.md) | **All 34 inputs & their validation · all 14 toggles · dark mode · events · keyboard, loading, empty states, accessibility, i18n** |
| 26 | [Field validation reference](./26-field-validation-reference.md) | **Every one of the 12 forms field-by-field** — mandatory status, validation, error message, default, submit behaviour |

---

## Navigation flow

```
Splash ──replace──▶ Onboarding ──replace──▶ Login ──navigate──▶ Otp
 2000ms              3 slides                phone              6 digits
                                                                  │ navigate
                                                                  ▼
MainTabs ◀──replace── ProfileSetup ◀──replace── Permissions
   │                   saves to AsyncStorage     2 fake toggles
   │
   ├─ Home ──▶ CategoryList ──▶ RequestDetails ──▶ VolunteerJourney ──▶ ImpactStory
   ├─ My Helps ──▶ RequestDetails / VolunteerJourney / ImpactStory
   ├─ Report (3-step wizard)
   ├─ Alerts ──▶ VolunteerJourney (no params ⚠️)
   └─ Profile ──▶ MissionJournal · ImpactStories · Flagged · EditProfile
                  Settings · InviteFriends
```

> `replace` drops the previous screen; `navigate` keeps it. The mix is why back on Profile
> Setup lands on the **OTP screen** — [06 gap #1](./06-profile-setup-screen.md#6-gaps--known-issues).

---

## 🔗 Sharing — audit across the whole app

Five screens offer sharing. **Two work; three are identical `alert()` stubs.**

| Screen | WhatsApp | Instagram | Facebook | Copy link | Verdict |
|---|---|---|---|---|---|
| [17 — Impact Story](./17-impact-story-screen.md) `:150` | ✅ `whatsapp://send` → `wa.me` fallback → alert if absent | ✅ System share sheet (Instagram has no prefill API) | ✅ `sharer.php` → system sheet fallback | ✅ `expo-clipboard` + confirmation | **Real** |
| [22 — Invite Friends](./22-invite-friends-screen.md) `:15,22` | ✅ via native `Share.share()` | ✅ same | ✅ same | ✅ `expo-clipboard` | **Real** |
| [13 — Category List](./13-category-list-screen.md) `:699` | ❌ `alert('Sharing to WhatsApp...')` | ❌ alert | ❌ alert | ❌ alert | **Stub** |
| [14 — Request Details](./14-request-details-screen.md) `:1055` | ❌ alert | ❌ alert | ❌ alert | ❌ alert | **Stub** |
| [15 — Volunteer Journey](./15-volunteer-journey-screen.md) `:626` | ❌ alert | ❌ alert | ❌ alert | ❌ alert | **Stub** |

**The working implementation already exists** in `ImpactStoryScreen.js:150–192` — layered
deep-link fallbacks, real clipboard, proper error handling and explanatory comments. The
three stub sheets are visually identical copies of the same UI with `alert()` bodies.
Extracting `handleShare` into a shared component would fix all three.

**Also broken regardless of implementation:** the shared URLs don't resolve. Impact Story
shares `uthavuu.org/impact/story/{id}` (double `u`); Invite Friends shares
`uthavu.org/invite/…` (single `u`). Neither domain has a route in `apps/web`, which serves
only `/`, `/admin` and `/admin/dashboard`. And no share event is ever recorded, so the
admin console's `shares` counter can never move.

---

## 🚩 Moderation — fake reports, spam, suspect users

### What the app can report

**Content only. There is no report-user, block-user or mute-user action anywhere in
`apps/mobile/src`** — verified by grep.

| Path | Where | Reason captured? |
|---|---|---|
| **Report Post to Admin** — 7-reason modal | [14](./14-request-details-screen.md#2-reporting-fake--spam-content) `:1275` | ✅ **Yes** — Fake / Misleading · Wrong Location · Spam · Inappropriate Content · Duplicate · Already Resolved · Other |
| Quick 🚩 on a list card | [13](./13-category-list-screen.md) `:635` | ❌ No — silently defaults to `'Reported by user'` |
| "Report this update" in the feed | [14](./14-request-details-screen.md) `:682` | ❌ **Nothing recorded** — an `Alert` only |

### Where reports go

**Nowhere.** `FlagContext.js:10` states it: *"UI-only for now — flags live in memory and
reset when the app reloads."* Yet the app tells the user otherwise:

> *"Thank you for keeping Udhavu safe. Uthavu Admins will review this report in the Flagged
> Reports queue."* — `RequestDetailsScreen.js:53`

The admin console has the whole receiving end built — *Flagged Reports* (`:2067`),
`MOCK_FLAGS` (`:90`), and a dedicated `MOCK_FAKE_REPORTS` scam queue (`:84`) — all
hardcoded. Nothing connects.

### The "AI moderation" scan

[14 §3](./14-request-details-screen.md#3-the-simulated-ai-moderation-scan) — posting an
update with a photo shows *"AWS Content Moderation detected sensitive content"*. In fact:

- No AWS SDK, no network call — a `setTimeout`
- It greps the **caption text** for `'unsafe'` or `'nudity'`; the image is never examined
- The photo itself is a hardcoded Unsplash URL ([14](./14-request-details-screen.md) `:190`)
- The result state (`aiScanStatus`, `pendingReview`) is set but **never rendered**

### Suspect users

The admin console tracks per-user `flags`, `warnings`, `suspensions` and a `status` of
Active / **Suspended** / **Blocked** (`admin/dashboard/page.tsx:62`). **The mobile app has
no concept of any of it** — a blocked user's app behaves exactly like anyone else's, and no
mobile action can increment a warning or flag count.

---

## 📝 Forms, validation, toggles & theme

Full detail in [25 — Forms, validation & cross-cutting](./25-forms-validation-and-cross-cutting.md).

| Question | Answer |
|---|---|
| **Is there an events feature?** | ❌ **No.** Grep finds only `scrollEventThrottle` and `pointerEvents`. No events/campaigns/meetups screen, route, data or menu entry exists |
| **How many forms?** | 34 `<TextInput>` across 11 screens |
| **How much validation?** | **4 places total** — OTP digit regex, Login length, Report Flow email regex, Support required-fields. Everything else accepts anything |
| **Worst case** | [20 Edit Profile](./20-edit-profile-screen.md) — **14 inputs, zero validation**, including email, pincode and emergency contact |
| **Input hygiene** | `maxLength` on 2 of 34 · `keyboardType` on 7 of 34 · no password field anywhere (OTP-only auth) |
| **Toggles** | 14 `<Switch>` across 4 screens — **exactly 1 has any observable effect** (`showProfession`) |
| **Dark mode** | ❌ **Impossible.** `app.json` pins `"userInterfaceStyle": "light"`, no theme provider, **0** uses of `useColorScheme`. The switch on screen 21 flips a boolean nothing reads |
| **Light mode** | The only mode. `<StatusBar style="auto" />` in `App.js:122` is the one place the *device* theme leaks in — causing the splash contrast issue |
| **Real settings** | The route named `Settings` renders "Help & Support". All 4 of its toggles are inert; the settings that work live on other screens |

### Present in **zero** screens

| Pattern | Count | Consequence |
|---|---|---|
| `KeyboardAvoidingView` | **0** | 34 inputs, none protected from the keyboard |
| `RefreshControl` | **0** | No pull-to-refresh on any list |
| `ActivityIndicator` / loading state | **0** | No pattern to follow when the API lands |
| Error states | **0** | No screen can show a failed request |
| i18n library | **0** | English copy in a Tamil-named app |
| Empty states | **2** | Only [11 Alerts](./11-alerts-screen.md) and [18 Mission Journal](./18-mission-journal-screen.md) |
| `accessibilityLabel` / `Role` | **9** | Across 24 screens — all in just 2 files |

---

## Design tokens

`apps/mobile/src/theme.js` — 12 colours, 5 sizes.

```js
COLORS = { primaryGreen: '#16A34A', secondaryBlue: '#2563EB', emergency: '#DC2626',
           warning: '#F59E0B', food: '#F97316', animal: '#8B5CF6', community: '#06B6D4',
           bgGrey: '#F8FAFC', textPrimary: '#111827', textSecondary: '#6B7280',
           bgWhite: '#FFFFFF', borderColor: '#E5E7EB' }
SIZES  = { radiusSm: 8, radiusMd: 16, radiusLg: 24, radiusFull: 9999, padding: 24 }
```

**Adherence varies widely.** Best: `MapScreen` (70 tokens : 4 hexes — and it's orphaned),
`ImpactStoriesScreen` (24 : 4). Worst: `InviteFriendsScreen` (11 : 28),
`RequestDetailsScreen` (120 : 158). Two screens use a **different green** — `#10B981`
instead of `#16A34A` — on [05](./05-permissions-screen.md) and
[06](./06-profile-setup-screen.md).

## Iconography

Every icon comes from **`lucide-react-native`** (^1.26.0, resolved 1.27.0) via
`react-native-svg` 15.15.4. Icons are components, not image files — including the brand mark
on the splash screen. See [01 §2](./01-splash-screen.md#2-brand-assets--where-they-actually-come-from).

---

## What actually persists

| Data | Captured on | Persisted? |
|---|---|---|
| Phone number | 03 Login | ❌ Never stored or passed on |
| OTP / session | 04 OTP | ❌ No verification, no token |
| Location & notification consent | 05 Permissions | ❌ Discarded |
| Profile (21 fields) | 06 Setup, **20 Edit Profile** | ✅ AsyncStorage `@uthavu_user_profile_v2` |
| Email | 10 Report Flow | ✅ Same store |
| **The report itself** | 10 Report Flow | ❌ **Discarded** |
| Flags | 13, 14 | ❌ Memory only, reset on reload |
| Alert read state | 11 Alerts | ❌ Memory only |
| Support tickets | 21 | ❌ Memory only |

**Two real write paths exist** — the profile editors and the email capture. Everything else
is presentation over hardcoded arrays.

---

## ✅ Device-verified findings

Confirmed against real screenshots of the running app, not read from source alone.

| # | Finding | Screen | Evidence | Doc |
|---|---|---|---|---|
| 1 | **Publish is enabled with no category selected.** The expiry picker reads *"Pick a category first — it sets how long this request stays open"* while **"Publish Report 🚀" renders fully green and enabled** directly below it. The screen says the report isn't ready and offers to publish it in the same view. | 10 Report Flow, step 2 | Screenshot | [10 §4.3](./10-report-flow-screen.md#43-confirmed-on-device) |
| 2 | **The back arrow appears on a root tab.** Rendered with **My Helps highlighted green in the tab bar** — i.e. reached via the tab, where the code's comment says it should be hidden. Tapping it switches to the previously active tab. | 09 My Helps | Screenshot | [09 §1.1](./09-my-helps-screen.md#11-the-conditional-back-arrow-doesnt-work-as-its-comment-claims), gap #11 |
| 3 | **Active cards render no image** despite `item.image` being set on both records; only completed cards show a thumbnail. | 09 My Helps | Screenshot | [09 gap #5](./09-my-helps-screen.md#6-gaps--known-issues) |
| 4 | **`Alert` is imported correctly** in `RequestDetailsScreen.js:4` — the crash `FUNCTIONAL_FLOW.md §12 #2` reports as open **does not exist**. All 12 call sites resolve. | 14 Request Details | Source read | [14 §5.1](./14-request-details-screen.md#51-a-defect-the-repos-own-docs-report-that-does-not-exist) |
| 5 | **Splash logo is code, not an image.** The two PNGs that look like it (`assets/splash-icon.png`, `web/public/splash_logo.png`) are byte-identical Expo/Next placeholders (`md5 97dae5a0…`) referenced by nothing. | 01 Splash | md5 + grep | [01 §2.2](./01-splash-screen.md#22-image-assets-that-exist-but-are-not-used-here) |
| 6 | **The reporter card shows no star rating** — Verified · 96% Reliability · 38 Reports · 34 Resolved. Confirms **Rule 10 is satisfied**; `rating` at `:411` is dead code. Corrected a claim in these docs. | 14 Request Details | Screenshot + source | [14 §1A.2](./14-request-details-screen.md#1a2-rule-10---satisfied-no-star-rating-is-rendered) |
| 7 | **Profile renders its empty state as "User" / "Location not set" — beside a ✓ Verified badge and 96% Reliability.** The card admits it knows nothing about the user while asserting they are verified. | 12 Profile | Screenshot | [12 §1.1](./12-profile-screen.md#11-first-run-appearance--what-the-card-shows-with-an-empty-profile) |
| 8 | **Volunteer Journey renders the fallback category 🐶 Animal Rescue above a passed food-donation title** — the defensive defaults produce a self-contradicting card. | 15 Volunteer Journey | Screenshot | [15 §0.1](./15-volunteer-journey-screen.md#01-element-reference) |

### Corrections made to these docs

| Claim originally written | Corrected to | Where |
|---|---|---|
| "Every real flag has the same reason `'Reported by user'`" | Only the **quick 🚩 on Category List** loses the reason. Request Details passes the user's choice from a 7-option modal | [19 §3](./19-flagged-screen.md), gap #2 |
| "Mission Journal has no empty state" | It **does** — `:227–233`, `BookOpen` icon + "No missions found". One of only two in the app | [18](./18-mission-journal-screen.md), gaps #5/#6 merged |
| "`canGoBack()` is correct handling — worth reusing" | **Wrong.** Bottom tabs keep history, so it's `true` on almost every visit | [09 §1.1](./09-my-helps-screen.md), gap #11 |
| "`GoogleAdMobCard` is imported but never rendered" | It **is** rendered, at `DashboardScreen.js:271` | [08 §6](./08-dashboard-screen.md), [23](./23-shared-components.md) |
| "`rating` renders **⭐ 4.9** on every reporter card" | **Wrong — nothing renders it.** `RequestDetailsScreen.js:411` is a dead variable, assigned once and never read. The card shows Verified · Reliability · Reports · Resolved. **Rule 10 is satisfied on mobile**; the only live star left is the admin analytics tile | [14 §1A.2](./14-request-details-screen.md#1a2-rule-10---satisfied-no-star-rating-is-rendered), [PRODUCT-DECISIONS](../PRODUCT-DECISIONS.md#decision-1--no-star-ratings) |
| "The Report tab opens as a modal" | It is an ordinary `Tab.Screen` (`MainTabs.js:88`) styled as a FAB — so state survives tab switches and there is no dismiss gesture | [07](./07-main-tabs.md) |

---

## Related

`apps/mobile/FUNCTIONAL_FLOW.md` holds the product specification (19 business rules, mission
lifecycle, gap analysis). These docs cover **UI and implementation**; that one covers
**product rules**.

⚠️ Note that `FUNCTIONAL_FLOW.md §12 #2` reports an open `Alert` import crash in
`RequestDetailsScreen`. **That defect does not exist** — `Alert` is imported at `:4` and all
12 call sites resolve. See [14 §5.1](./14-request-details-screen.md#51-a-defect-the-repos-own-docs-report-that-does-not-exist).
