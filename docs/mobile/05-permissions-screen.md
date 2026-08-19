# 05 — Permissions Screen

> **Screen 5 of the mobile app.** Explains why Uthavu wants location and notifications.
> ⚠️ **It does not actually request either permission** — the toggles are decorative.

| | |
|---|---|
| **Route name** | `Permissions` |
| **Source file** | `apps/mobile/src/screens/PermissionsScreen.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/App.js:56–60` |
| **Entry animation** | `slide_from_right` |
| **Arrives from** | `Otp` (via `navigate`) |
| **Navigates to** | `ProfileSetup` (via `replace` — the whole auth chain is dropped) |
| **Can go back** | ❌ No back control on screen |
| **OS permission prompts** | **None** — see gap #1 |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌──────────────────────────────┐
│            ╭───╮             │  iconCircle 54 dp, bg #ECFDF5
│            │ 🛡 │             │  ShieldCheck 28, #10B981
│            ╰───╯             │
│       App Permissions        │  22 / 700 / #0F172A
│  Enable permissions to view  │  13 / #64748B / centred
│  nearby emergency help…      │
│                              │
│  ┌────────────────────────┐  │
│  │ 📍  Location Access   ✓│  │  row · 14 pad · radius 14 · 1px border
│  │     Required to disc…  │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 🔔  Push Notifications✓│  │
│  │     Alerts you when…   │  │
│  └────────────────────────┘  │
│                              │
│  🔒 Your location is only…   │  11 / #64748B
│                              │
│  ┌────────────────────────┐  │
│  │       Continue         │  │  bg #10B981 · radius 12
│  └────────────────────────┘  │
│       Skip for now           │  13 / #64748B
└──────────────────────────────┘
```

Wrapped in a `ScrollView` (`showsVerticalScrollIndicator={false}`) — the only screen in the
auth flow that scrolls. Content is **not** bottom-pinned; the buttons sit directly under
the privacy note.

---

## ⚡ Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Location row** (icon, text or circle — the whole row) | `:32` | Flips a boolean and redraws the check circle. ❌ **No OS permission dialog appears.** `expo-location` is not installed | `locationAllowed` | — |
| 2 | **Notifications row** | `:50` | Same — flips a boolean only. ❌ No OS prompt; `expo-notifications` is not installed | `notificationsAllowed` | — |
| 3 | Header shield icon / title / subtitle | `:19–27` | ❌ Nothing | — | — |
| 4 | Privacy note (🔒 line) | `:69` | ❌ Nothing — not a link to a policy | — | — |
| 5 | **"Continue"** | `:78` | Moves to Profile Setup. ❌ **Neither toggle value is read, saved, or sent anywhere** | — | `ProfileSetup` (**replace**) |
| 6 | **"Skip for now"** | `:81` | ❌ **Exactly the same as #5** — both are bound to `handleContinue` | — | `ProfileSetup` (**replace**) |
| 7 | Android hardware back | — | Pops to the OTP screen (Permissions was pushed with `navigate`) | — | `Otp` |

**The two buttons are literally the same handler:**

```jsx
<TouchableOpacity style={styles.primaryBtn} onPress={handleContinue}>  {/* :78 */}
<TouchableOpacity style={styles.skipBtn}    onPress={handleContinue}>  {/* :81 */}
```

So every path off this screen is identical, and no choice made on it has any effect.

---

## 2. Icons

All five come from `lucide-react-native` (`PermissionsScreen.js:3`). No image assets.

| Icon | Where | Size | Colour | Stroke |
|---|---|---|---|---|
| `ShieldCheck` | Header circle | `28` | `#10B981` | `2` |
| `MapPin` | Location row | `20` | `#0284C7` on · `#64748B` off | `2` |
| `Bell` | Notifications row | `20` | `#D97706` on · `#64748B` off | `2` |
| `Check` | Both check circles | `12` | `#FFFFFF` | `3` |
| `Lock` | Privacy note | `12` | `#64748B` | default |

---

## 3. Visual specification

From `PermissionsScreen.js:90–220`.

> 🚨 **This screen does not import `theme.js` at all.** Every colour and radius is a raw
> literal. It is the only screen in the auth flow that bypasses the design system — and it
> uses a **different green** from the rest of the app. See §5 gap #2.

### 3.1 Header

| Element | Spec |
|---|---|
| `iconCircle` | `54 × 54`, `borderRadius: 27`, bg `#ECFDF5`, `marginBottom: 12` |
| Title | `22` / `700` / `#0F172A` / `marginBottom: 6` |
| Subtitle | `13` / `#64748B` / centred / `lineHeight: 18` / `paddingHorizontal: 8` |

### 3.2 Permission rows

Two identical rows in a `gap: 10` list.

| Element | Spec |
|---|---|
| Row | `flexDirection: 'row'`, `padding: 14`, `borderRadius: 14`, `borderWidth: 1`, `gap: 12`, bg `#FFFFFF` |
| Border — off | `#E2E8F0` |
| Border — **on** | `#CBD5E1` (`styles.rowActive`) |
| Icon box | `38 × 38`, `borderRadius: 10`, tinted background per state |
| Row title | `14` / `600` / `#0F172A` / `marginBottom: 2` |
| Row subtitle | `11.5` / `#64748B` / `lineHeight: 15` |
| Check circle — off | `20 × 20`, `borderRadius: 10`, `borderWidth: 1.5`, border `#CBD5E1`, empty |
| Check circle — **on** | same, border + fill `#10B981`, white `Check` icon inside |

The active/inactive difference on the row border is `#E2E8F0` → `#CBD5E1` — two adjacent
greys. Practically invisible; the check circle carries the whole state signal.

### 3.3 Row content (verbatim)

| Row | Title | Subtitle | Icon tint (on) |
|---|---|---|---|
| 1 | Location Access | Required to discover emergency rescue calls near you. | `#E0F2FE` box / `#0284C7` icon |
| 2 | Push Notifications | Alerts you when someone accepts your report. | `#FEF3C7` box / `#D97706` icon |

### 3.4 Privacy note & buttons

| Element | Spec |
|---|---|
| Privacy row | `Lock` 12 + text `11` / `#64748B`, `gap: 6`, `marginBottom: 24` |
| Privacy copy | "Your location is only used while actively responding to or creating reports." |
| Primary button | bg `#10B981`, `borderRadius: 12`, `paddingVertical: 14`, text `#FFFFFF` 15/600 |
| Skip button | text-only, `paddingVertical: 8`, text `#64748B` 13/500 |

---

## 4. Functionality

### 4.1 State

```js
const [locationAllowed, setLocationAllowed]           = useState(true);   // default ON
const [notificationsAllowed, setNotificationsAllowed] = useState(true);   // default ON
```

Both default to **on**. Tapping anywhere on a row flips its boolean:

```js
onPress={() => setLocationAllowed(!locationAllowed)}
```

The whole row is the touch target (`activeOpacity={0.8}`) — there is no separate switch
control; the check circle is a plain `<View>` that reflects state.

### 4.2 Continue and Skip do exactly the same thing

```js
// PermissionsScreen.js:9–11
const handleContinue = () => {
  navigation.replace('ProfileSetup');
};
```

```jsx
<TouchableOpacity style={styles.primaryBtn} onPress={handleContinue}>   {/* :78 */}
<TouchableOpacity style={styles.skipBtn}    onPress={handleContinue}>   {/* :81 */}
```

Both buttons are bound to the same handler. **"Skip for now" is functionally identical to
"Continue"** — and since neither reads `locationAllowed` or `notificationsAllowed`, the
toggles have no effect on anything either.

### 4.3 What happens to the toggle values

Nothing. They are local `useState`, never written to context, never persisted, never sent
anywhere. On `replace('ProfileSetup')` the component unmounts and both values are gone.

### 4.4 Navigation

```
Otp ──navigate──▶ Permissions ──replace──▶ ProfileSetup
                       │
                  replace() drops the entire
                  Login → Otp → Permissions chain
```

`replace` is the right call here — a user shouldn't be able to walk back into OTP after
passing it. The consequence is that Profile Setup has no reachable back target.

---

## 5. Mobile ↔ Admin web connection

**None.** Nothing is recorded about what the user consented to.

**Why this matters beyond a missing API call:** the admin dashboard's core feature is
dispatching reports to nearby volunteers. That depends on knowing (a) whether a user
granted location and (b) whether they can receive a push. Neither fact currently leaves
this screen, so the admin side has no way to know who is reachable.

Expected once wired:

```
PATCH /users/me/permissions { location: bool, notifications: bool, pushToken?: string }
```

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **No real permissions are requested.** The screen imports no `expo-location` and no `expo-notifications` — neither package is even in `package.json`. Toggling a row changes a boolean and nothing else. | The user believes they granted location and push. The OS was never asked, so the app has neither. Every downstream feature that needs location (Map tab, nearby reports, the whole dispatch model) will fail or silently show nothing. **This is the most consequential gap in the auth flow.** | `npx expo install expo-location expo-notifications`, then call `requestForegroundPermissionsAsync()` / `requestPermissionsAsync()` from the row handlers and drive the toggle from the real result. |
| 2 | **Wrong green.** The primary button and check circles use `#10B981` (emerald-500). The brand green is `#16A34A` (`COLORS.primaryGreen`), used by every other screen. | Put screen 04 and 05 side by side and the buttons are visibly different greens. | Import `COLORS` and use `primaryGreen`. |
| 3 | **`theme.js` is never imported.** ~15 raw hexes (`#0F172A`, `#64748B`, `#E2E8F0`, `#CBD5E1`, `#ECFDF5`, `#E0F2FE`, `#0284C7`, `#FEF3C7`, `#D97706`, `#F1F5F9`, `#10B981`) plus non-token radii (`12`, `14`, `10`, `27`). | This screen drifts independently of the design system. It's a slate/emerald palette dropped into a green/grey app. | Move every literal into `theme.js` and import. |
| 4 | **Skip and Continue are the same action.** Both call `handleContinue`. | Offering a choice that isn't one. Once gap #1 is fixed, Skip must mean "don't ask the OS". | Give Skip its own handler that bypasses the permission requests. |
| 5 | **Toggle state is discarded.** Never persisted or sent. | No record of consent — a problem for both product logic and privacy compliance. | Write to `UserContext` (which already persists to AsyncStorage) and sync to the backend. |
| 6 | **Defaults are `true`.** Both permissions show as granted before the user does anything. | Pre-ticked consent is a dark pattern and won't match the OS state once real prompts land. | Default to `false`; initialise from the actual OS permission status. |
| 7 | **Rows aren't accessible as switches.** A `TouchableOpacity` with a decorative `View`, no `accessibilityRole="switch"`, no `accessibilityState`. | Screen readers can't announce or toggle these. | Use `accessibilityRole="switch"` + `accessibilityState={{ checked }}`, or a real `<Switch>`. |
| 8 | **On/off border difference is invisible** — `#E2E8F0` vs `#CBD5E1`. | The `rowActive` style is effectively dead code. | Use the brand green for the active border, or drop the style. |
| 9 | **Mixed StatusBar APIs.** This screen imports `StatusBar` from `react-native` (`:2`, `:15`) while `App.js:4` uses `expo-status-bar`. | Two libraries fighting over the same bar; `backgroundColor` is Android-only. | Standardise on `expo-status-bar`. |
| 10 | **No back control.** No arrow, and `replace` from here means nothing to go back to anyway. | Consistent with the flow's intent, but the screen looks different from OTP, which has one. | Intentional — leave, but note it. |
| 11 | **Copy over-promises.** "Required to discover…" — but it's skippable and never enforced. | Misleading. | Say "Recommended", or genuinely gate the feature. |

> **Fix order:** #1 first (it's a functional hole, not a polish item), then #2/#3 together
> as one theming pass, then #5.

---

## 6A. What works well

- **The status bar is set explicitly** (`:15`) — `barStyle="dark-content"` with a matching
  `backgroundColor`, so the screen never inherits a dark bar from the splash.
- **Each permission states why it is needed**, next to the toggle rather than in a separate
  explainer — the pattern that actually earns a grant.
- **Nothing is blocked** — the user can continue without granting, which is correct for a
  screen that cannot yet request real OS permissions.

---

## 7. QA checklist

- [ ] Tapping a row flips its check circle from empty to filled.
- [ ] Tapping anywhere on the row — icon, text, or circle — toggles it.
- [ ] Icon tint changes with state (blue↔grey, amber↔grey).
- [ ] An OS permission dialog actually appears (blocked by gap #1).
- [ ] Continue lands on Profile Setup.
- [ ] Skip for now does something *different* from Continue (blocked by gap #4).
- [ ] Content scrolls on a short device without clipping the buttons.
- [ ] Compare the Continue button against the OTP screen's Verify button — they should be
      the same green (blocked by gap #2).
- [ ] Denying at the OS level is reflected in the toggle (blocked by gap #1).

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Add a permission row | Duplicate the block at `PermissionsScreen.js:32–47`, add matching state |
| Row copy | `:41–42` (location), `:59–60` (notifications) |
| Privacy note | `:71–73` |
| Where Continue goes | `:10` |
| Give Skip its own behaviour | `:81` — currently points at `handleContinue` |
| Button colour | `styles.primaryBtn` (`:200–205`) |
| Default toggle states | `:6–7` |

---

**Previous:** [04 — OTP Verification](./04-otp-screen.md) · **Next:** [06 — Profile Setup](./06-profile-setup-screen.md)
