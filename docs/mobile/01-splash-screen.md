# 01 — Splash Screen

> **Screen 1 of the mobile app.** The first thing a user ever sees. Shows the brand for
> 2 seconds, then hands off to Onboarding.

| | |
|---|---|
| **Route name** | `Splash` |
| **Source file** | `apps/mobile/src/screens/SplashScreen.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/App.js:40` |
| **Is initial route** | ✅ Yes — `initialRouteName="Splash"` (`App.js:37`) |
| **Header** | Hidden — `screenOptions={{ headerShown: false }}` (`App.js:38`) |
| **Navigates to** | `Onboarding` via `navigation.replace()` |
| **Duration** | 2000 ms |
| **Network calls** | None |
| **Talks to admin web** | No |

---

## 1. What it looks like

There is **no screenshot or image file for this screen** — nothing to reference, because
the entire screen is drawn in code at runtime. What renders:

```
┌──────────────────────────────┐
│                              │
│                              │   background: #16A34A (brand green), full bleed
│                              │
│                              │
│             ♡                │   HeartHandshake icon · 80 dp · #FFFFFF · stroke 1.5
│                              │
│           உதவு               │   36 / bold / #FFFFFF / letter-spacing 1
│                              │       ↑ marginTop 16 below the icon
│                              │
│                              │
│                              │
│ Helping begins with one      │   14 / weight 500 / rgba(255,255,255,0.9)
│          person.             │       ↑ absolute, 50 dp from the bottom
└──────────────────────────────┘
```

The logo and wordmark sit in one centred block; the tagline is pinned separately to the
bottom edge. Exact values in §3.

> **Note when checking against a dev build:** the blue ⚙️ gear that floats at the top-right
> is the **Expo dev-client menu**, not part of this screen. It does not exist in a
> production build.

---

## ⚡ Interaction map — every tap target

**There are none.** This is the only screen in the app with zero interactive elements.

| Element | Tappable? | What happens |
|---|---|---|
| Logo | ❌ | Nothing — it's a bare `<HeartHandshake>` inside a `<View>` |
| உதவு wordmark | ❌ | Nothing — plain `<Text>` |
| Tagline | ❌ | Nothing |
| Anywhere on screen | ❌ | Nothing. No `TouchableOpacity`, `Pressable`, or gesture handler exists in the file |
| Android hardware back | ❌ | Nothing — this is the initial route, so there is no history to pop |

The **only** thing that advances this screen is the 2000 ms timer. There is no skip, no
tap-to-continue, and no way to make it go faster or slower from the UI.

---

## 2. Brand assets — where they actually come from

### 2.1 The logo is code, not an image file

The heart-in-hands mark is the **`HeartHandshake`** icon from `lucide-react-native`,
imported directly into the screen:

```js
// apps/mobile/src/screens/SplashScreen.js:3
import { HeartHandshake } from 'lucide-react-native';
```

```jsx
// apps/mobile/src/screens/SplashScreen.js:17
<HeartHandshake size={80} color={COLORS.bgWhite} strokeWidth={1.5} />
```

| Property | Value | Source |
|---|---|---|
| Icon component | `HeartHandshake` | `lucide-react-native` |
| Package version | `^1.26.0` (resolved **1.27.0**) | `apps/mobile/package.json` |
| Renderer | `react-native-svg` **15.15.4** | `apps/mobile/package.json` |
| Size | `80` (80×80 dp) | `SplashScreen.js:17` |
| Colour | `COLORS.bgWhite` = `#FFFFFF` | `src/theme.js:12` |
| Stroke width | `1.5` (lucide default is `2` — deliberately thinned) | `SplashScreen.js:17` |

**Installed icon source on this machine:**
```
node_modules/.pnpm/lucide-react-native@1.27.0_.../node_modules/lucide-react-native/dist/esm/icons/heart-handshake.mjs
```

**To reuse the exact same mark anywhere else in the app** — do this, never re-export a PNG:

```jsx
import { HeartHandshake } from 'lucide-react-native';
import { COLORS } from '../theme';

<HeartHandshake size={80} color={COLORS.bgWhite} strokeWidth={1.5} />
```

For the **admin web** (`apps/web`), the identical mark ships in the sibling package
`lucide-react` (also 1.27.0), so the two products stay pixel-consistent:

```tsx
import { HeartHandshake } from 'lucide-react';

<HeartHandshake size={80} color="#16A34A" strokeWidth={1.5} />
```

### 2.2 Image assets that exist but are NOT used here

These files look like logos but are **untouched framework placeholders** — the default
grey concentric-circles-on-a-grid graphic. Verified byte-identical to each other
(`md5 97dae5a0e62ad8551d8a31897b425e63`) and referenced by no source file:

| Path | Status |
|---|---|
| `apps/mobile/assets/splash-icon.png` | ❌ Placeholder, unreferenced |
| `apps/web/public/splash_logo.png` | ❌ Placeholder, unreferenced |

Also placeholders (`md5 cb975bba2216ce10a60e6c0ffe9941a2`), for completeness:
`apps/mobile/assets/icon.png`, `apps/web/public/app_logo.png`.

➡️ **Open item:** if a real launcher icon / native splash is ever needed, these are the
files to replace. See §7.

---

## 3. Visual specification

Copied verbatim from the `StyleSheet` in `SplashScreen.js:27–53`.

### 3.1 Screen

| Token | Value | Source |
|---|---|---|
| Background | `COLORS.primaryGreen` = **`#16A34A`** | `theme.js:2` |
| Layout | `flex: 1`, `justifyContent: 'center'`, `alignItems: 'center'` | `styles.container` |

### 3.2 Centre block (`styles.centerContent`)

Vertically and horizontally centred. Contains the logo and the wordmark.

| Element | Spec |
|---|---|
| Logo | 80×80, `#FFFFFF`, stroke `1.5` |
| Wordmark | **உதவு** |
| — font size | `36` |
| — colour | `COLORS.bgWhite` = `#FFFFFF` |
| — weight | `bold` |
| — letter spacing | `1` |
| — gap above | `marginTop: 16` |

### 3.3 Tagline (`styles.bottomContent` + `styles.tagline`)

| Property | Value |
|---|---|
| Copy | `Helping begins with one person.` |
| Position | `position: 'absolute'`, `bottom: 50` |
| Colour | `rgba(255, 255, 255, 0.9)` — 90 % white, **not** a theme token |
| Font size | `14` |
| Font weight | `'500'` |

### 3.4 Colour swatches used

| Swatch | Hex | Role |
|---|---|---|
| 🟩 | `#16A34A` | Screen background (brand green) |
| ⬜ | `#FFFFFF` | Logo stroke + wordmark |
| ⬜ | `rgba(255,255,255,0.9)` | Tagline |

---

## 4. Functionality — what the code does

### 4.1 Full source

```jsx
// apps/mobile/src/screens/SplashScreen.js
const SplashScreen = ({ navigation }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Onboarding');
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigation]);
  ...
};
```

### 4.2 Behaviour, step by step

1. **Mount.** `App.js` renders `Splash` as the initial route inside
   `SafeAreaProvider → UserProvider → FlagProvider → NavigationContainer`.
2. **Paint.** Green screen, white logo + `உதவு` centred, tagline pinned 50 dp from the bottom.
3. **Timer starts.** `useEffect` runs once (`[navigation]` is stable) and schedules a
   2000 ms `setTimeout`.
4. **Timer fires.** `navigation.replace('Onboarding')`.
5. **Cleanup.** The effect's teardown calls `clearTimeout(timer)` if the screen unmounts
   early — prevents a navigate-after-unmount warning.

### 4.3 Why `replace()` and not `navigate()`

`replace` **swaps** Splash out of the navigation stack instead of pushing on top of it.
Consequence: once Onboarding is showing, pressing the Android hardware back button
**cannot** return to the splash. This is correct — a splash screen must never be
reachable again.

### 4.4 State

The screen reads and writes **nothing**. No `useState`, no context consumption, no
AsyncStorage, no API call. It is purely presentational plus one timer.

Note that `UserProvider` (`src/context/UserContext.js`) *is* mounted above it and *is*
loading the stored profile from `AsyncStorage` key `@uthavu_user_profile_v2` concurrently
during these 2 seconds — but the splash screen never checks the result. See §7.

---

## 5. Navigation map

```
  app launch
      │
      ▼
┌─────────────┐   navigation.replace('Onboarding')
│   Splash    │ ─────────────── after 2000 ms ──────────────▶ ┌──────────────┐
│ (initial)   │                                               │  Onboarding  │
└─────────────┘   Splash is REMOVED from the stack            └──────────────┘
                  ← back button cannot return here
```

| From | Trigger | To | Method | Animation |
|---|---|---|---|---|
| `Splash` | 2000 ms timeout | `Onboarding` | `navigation.replace` | `fade` (set on the Onboarding route, `App.js:44`) |

There is **no** way to enter `Splash` from anywhere else, and no user-triggered exit —
no tap handler, no skip button.

---

## 6. Mobile ↔ Admin web connection

**None.** This screen makes no network request, reads no remote config, and sends no
analytics or telemetry. It is fully functional in airplane mode.

The only thing shared with `apps/web` is **design language**, and only by convention today:

| Shared thing | Mobile | Admin web | Enforced? |
|---|---|---|---|
| Brand green `#16A34A` | `theme.js` → `COLORS.primaryGreen` | hardcoded in components | ❌ No shared token file |
| `HeartHandshake` mark | `lucide-react-native` 1.27.0 | `lucide-react` 1.27.0 | ⚠️ Same version, coincidentally |

`libs/shared` exists in the workspace but does **not** currently export design tokens —
so the green hex is duplicated by hand across the two apps. Documented as a gap in §7.

---

## 7. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **No native splash configured.** `apps/mobile/app.json` has no `splash` key. | Users see Expo's default **white** screen while the JS bundle boots, *then* the green splash — a white→green flash. | Add a `splash` block to `app.json` with `backgroundColor: "#16A34A"` so the native and JS splash match. |
| 2 | **Returning users still see Onboarding.** The splash always routes to `Onboarding` regardless of stored state, even though `UserContext` restores a saved profile from `@uthavu_user_profile_v2`. | Someone who finished setup last week is walked through onboarding + login again on every cold start. | Gate the destination on `isLoaded` + a persisted auth flag: `navigation.replace(hasSession ? 'MainTabs' : 'Onboarding')`. |
| 3 | **Fixed 2000 ms wait.** The delay is hardcoded and unconditional. | The app idles for a full 2 s even when everything is ready in 200 ms. | Race the timer against `isLoaded` from `useUser()`, or treat 2000 ms as a *maximum*. |
| 4 | **Status bar contrast.** `App.js:122` sets `<StatusBar style="auto" />`, which follows the system theme rather than the screen. | On a light-theme device, dark status-bar icons sit on the dark green background — low contrast. | Use `style="light"` while the splash is showing. |
| 5 | **Tagline colour is not a token.** `rgba(255,255,255,0.9)` is inline in the stylesheet. | Drifts from the design system. | Add e.g. `COLORS.whiteMuted` to `theme.js`. |
| 6 | **Brand green duplicated across apps.** No shared token package. | Mobile and admin can silently diverge. | Export `COLORS` from `libs/shared` and consume it in both apps. |
| 7 | **Placeholder icon assets.** `icon.png` / `splash-icon.png` are still Expo defaults. | Store listing and launcher icon are unbranded. | Replace with real artwork before any build. |

---

## 7A. What works well

- **The timer is cleaned up correctly** (`:11`) — `return () => clearTimeout(timer)` cancels
  the navigation if the screen unmounts first. A missing cleanup here is the classic RN leak
  that fires `replace()` on a dead screen; this file gets it right.
- **`replace()`, not `navigate()`** — the splash is removed from the stack, so no back gesture
  can return to it. Correct for a launch screen.
- **The logo is a component, not an image** — `HeartHandshake` from `lucide-react-native`
  scales to any density with no asset to ship or mis-size.
- **`initialRouteName="Splash"`** (`App.js:37`) is explicit rather than relying on declaration
  order.

---

## 8. QA checklist

- [ ] Cold start shows green `#16A34A`, not white, for the whole boot (blocked by gap #1).
- [ ] Logo renders as a white outlined heart-in-hands, stroke visibly thinner than default.
- [ ] `உதவு` renders correctly in Tamil on both iOS and Android (no tofu boxes).
- [ ] Tagline sits 50 dp above the bottom edge and is not clipped by the home indicator.
- [ ] Screen advances to Onboarding automatically in ~2 s with a fade.
- [ ] Back button on Onboarding does **not** return to the splash.
- [ ] Backgrounding the app during the 2 s window and returning does not crash or
      double-navigate.
- [ ] Verify on a small device (e.g. 5", 320 dp wide) that the wordmark does not wrap.

---

## 9. Changing this screen

| To change… | Edit |
|---|---|
| Duration | `SplashScreen.js:11` — the `2000` literal |
| Destination | `SplashScreen.js:9` — `navigation.replace('Onboarding')` |
| Background colour | `theme.js:2` — `COLORS.primaryGreen` (⚠️ used app-wide, not just here) |
| Logo / size / weight | `SplashScreen.js:17` |
| Wordmark text or size | `SplashScreen.js:18` + `styles.title` |
| Tagline copy | `SplashScreen.js:21` |

---

**Next:** [02 — Onboarding](./02-onboarding-screen.md)
