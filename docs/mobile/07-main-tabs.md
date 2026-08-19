# 07 — Main Tabs (navigation shell)

> **The app's home base.** Everything after Profile Setup lives inside this five-tab bar.
> Not a screen in itself — it's the container that hosts five screens and the centre
> Report FAB.

| | |
|---|---|
| **Route name** | `MainTabs` |
| **Source file** | `apps/mobile/src/navigation/MainTabs.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/App.js:66–70` |
| **Entry animation** | `fade` |
| **Navigator** | `createBottomTabNavigator` (`@react-navigation/bottom-tabs` ^7.18.14) |
| **Arrives from** | `ProfileSetup` (via `replace`) — auth stack is fully discarded |
| **Headers** | Hidden — `headerShown: false` |
| **Tabs** | 5 |

---

## 1. The tab bar

```
┌────────────────────────────────────────────────┐
│                                                │
│                    ╭────╮                      │  FAB floats 14 dp above
│                    │ ＋ │                      │  the bar's baseline
├──────────┬─────────┴────┴─────────┬────────────┤
│    ⌂     │    ♡     │       │  🔔•  │    👤    │  ← notif dot always on
│   Home   │ My Helps │       │ Alerts│  Profile │
└──────────┴──────────┴───────┴───────┴──────────┘
   height 80 · paddingTop 8 · paddingBottom 22
```

| Position | Route name | Label | Screen | Doc |
|---|---|---|---|---|
| 1 | `DashboardTab` | Home | `DashboardScreen.js` | [08 — Dashboard](./08-dashboard-screen.md) |
| 2 | `MyHelpsTab` | My Helps | `MyHelpsScreen.js` | [09 — My Helps](./09-my-helps-screen.md) |
| 3 | `ReportTab` | *(empty)* | `ReportFlowScreen.js` | [10 — Report Flow](./10-report-flow-screen.md) |
| 4 | `AlertsTab` | Alerts | `AlertsScreen.js` | [11 — Alerts](./11-alerts-screen.md) |
| 5 | `ProfileTab` | Profile | `ProfileScreen.js` | [12 — Profile](./12-profile-screen.md) |

> Tab route names end in `Tab` (`DashboardTab`), which is **not** the same as the stack
> route names in `App.js`. When navigating from a tab to a stack screen you use the stack
> name (`RequestDetails`), and React Navigation resolves it up the tree.

---

## ⚡ Interaction map — every tap target

| # | Element | Line | Tap → what happens | Navigates |
|---|---|---|---|---|
| 1 | **Home tab** | `:53` | Switches to the Dashboard. Icon turns green, stroke thickens to `2.5`, faint green fill appears | `DashboardTab` |
| 2 | **My Helps tab** | `:70` | Switches to the personal queue | `MyHelpsTab` |
| 3 | **Report FAB ＋** | `:87` | ⚠️ **Switches tabs — it does not open a modal.** The tab bar stays visible for the whole report wizard, so another tab can be tapped mid-report and progress is lost silently | `ReportTab` |
| 4 | **Alerts tab** | `:95` | Switches to notifications. The red dot **does not clear** — it is unconditional | `AlertsTab` |
| 5 | **Profile tab** | `:114` | Switches to the profile | `ProfileTab` |
| 6 | Notification dot | `:109` | ❌ Not tappable, and never changes state | — |
| 7 | Re-tapping the **active** tab | — | Nothing — React Navigation's default is a no-op when a stack has no depth | — |
| 8 | Android hardware back from a root tab | — | **Exits the app.** `MainTabs` was entered via `replace`, so there is no auth stack to return to | — |
| 9 | Long-press any tab | — | Nothing — no `tabLongPress` listener | — |

**FAB press states:** background `#16A34A` → `#15803D` while it is the active tab, and the
green glow deepens from `0.45` to `0.55` opacity. There is no separate pressed state.

---

## 2. Icons

All five from `lucide-react-native`. No images.

| Tab | Icon | Size | Inactive stroke | Active stroke | Active fill |
|---|---|---|---|---|---|
| Home | `Home` | `22` | `1.8` | `2.5` | `#16A34A20` |
| My Helps | `Heart` | `22` | `1.8` | `2.5` | `#16A34A`**`30`** ⚠️ |
| Report | `Plus` | `26` | — | — | white on a green circle |
| Alerts | `Bell` | `22` | `1.8` | `2.5` | `#16A34A20` |
| Profile | `User` | `22` | `1.8` | `2.5` | `#16A34A20` |

The fill is built by string concatenation — `COLORS.primaryGreen + '20'` — producing the
8-digit hex `#16A34A20` (RGB + alpha). React Native supports `#RRGGBBAA`, so this works,
but it silently breaks if `primaryGreen` is ever changed to an `rgb()` or named colour.

**My Helps uses `30` (≈19 % alpha) while the other three use `20` (≈13 %)** — the heart
reads slightly heavier than its neighbours. See gap #3.

### 2.1 Icon wrapper

Every icon sits in a fixed `36 × 28` centred `View` (`styles.iconWrapper`), which gives the
notification dot a stable anchor.

---

## 3. The Report FAB

The centre tab's icon is replaced with a custom component (`MainTabs.js:16–22`):

```jsx
function ReportTabIcon({ focused }) {
  return (
    <View style={[styles.fabButton, focused && styles.fabButtonActive]}>
      <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
    </View>
  );
}
```

| Property | Value | Note |
|---|---|---|
| Size | `52 × 52`, `borderRadius: 26` | Perfect circle |
| Background | `#16A34A` (`COLORS.primaryGreen`) | |
| Background — **active** | `#15803D` | Hardcoded green-700, not a token |
| Lift | `marginBottom: 14` | Pushes it above the bar |
| Shadow | colour `#16A34A`, opacity `0.45` (`0.55` active), radius `10`, offset `0,4` | Green glow |
| Elevation | `8` (Android) | |
| Icon | `Plus` 26, `#FFFFFF`, stroke `2.5` | |
| Label | `''` — empty string | See gap #5 |

**Important behavioural note:** the FAB is a real tab, not a modal launcher. Tapping it
*switches tabs* to `ReportFlowScreen`, so the tab bar stays visible throughout the report
wizard and the user can leave mid-flow by tapping another tab. That is a different model
from the usual "FAB opens a full-screen modal" pattern.

---

## 4. Visual specification

From `MainTabs.js:27–51` and `:135–171`.

### 4.1 Bar

| Property | Value | Token |
|---|---|---|
| Height | `80` | — |
| Padding top | `8` | — |
| Padding bottom | `22` | Hardcoded — see gap #2 |
| Background | `#FFFFFF` | `COLORS.bgWhite` |
| Top border | `1` solid `#E5E7EB` | `COLORS.borderColor` |
| Elevation (Android) | `12` | — |
| Shadow (iOS) | `#000` @ `0.08`, radius `12`, offset `0,-2` | Upward shadow |

### 4.2 Tint & labels

| Property | Value | Token |
|---|---|---|
| Active tint | `#16A34A` | `COLORS.primaryGreen` |
| Inactive tint | `#9CA3AF` | **Hardcoded** — third copy in the codebase |
| Labels shown | `tabBarShowLabel: true` | |
| Label style | `10` / `700` / `marginTop: 2` / `letterSpacing: 0.2` | |

### 4.3 Notification dot (Alerts tab only)

| Property | Value |
|---|---|
| Size | `7 × 7`, `borderRadius: 4` |
| Colour | `#EF4444` — hardcoded red |
| Ring | `1.5` white border |
| Position | `absolute`, `top: 0`, `right: 4` inside the icon wrapper |

```jsx
// MainTabs.js:108–110
{/* Notification dot */}
<View style={styles.notifDot} />
```

It is an unconditional `<View>`. **There is no state behind it** — no unread count, no
prop, no context. It is always on. See gap #1.

---

## 5. State available inside the tabs

`MainTabs` itself holds no state, but it sits under both providers mounted in `App.js:33–34`,
so every tab screen can read them:

| Provider | Hook | Holds | Persists? |
|---|---|---|---|
| `UserProvider` | `useUser()` | Profile — name, email, city, profession, privacy toggles, `isLoaded` | ✅ AsyncStorage `@uthavu_user_profile_v2` |
| `FlagProvider` | `useFlags()` | Flagged/reported requests — `flagged`, `isFlagged`, `toggleFlag`, `removeFlag`, `clearFlags` | ❌ In-memory only — cleared on reload |

`FlagContext` is explicit about this in its own comment (`FlagContext.js:10`):
*"UI-only for now — flags live in memory and reset when the app reloads."*

Flags are keyed by `` `${categoryId}:${requestId}` `` (`flagKey`) because request ids
restart at 101 inside every category and aren't globally unique.

---

## 6. Navigation

```
ProfileSetup ──replace──▶ MainTabs
                             │
        ┌──────────┬─────────┼─────────┬──────────┐
     Dashboard  MyHelps   Report    Alerts    Profile
        │                                        │
        └──────────── push onto the parent stack ┘
                              ▼
      CategoryList · RequestDetails · VolunteerJourney ·
      ImpactStories · ImpactStory · Flagged · EditProfile ·
      Settings · InviteFriends · MissionJournal
```

The 10 detail screens are registered on the **parent native stack** in `App.js`, not on the
tab navigator. Pushing one covers the tab bar entirely; `goBack()` returns to whichever tab
was active.

`MainTabs` is entered via `replace`, so the auth stack is gone — there is no back
destination from the tab bar. On Android, the hardware back button from a root tab exits
the app (React Navigation's default).

---

## 7. Mobile ↔ Admin web connection

**None at this level** — the navigator makes no calls. Individual tab screens are where
data would flow.

The one place the admin console *should* reach the tab bar is the Alerts badge: an admin
action (approving a report, assigning a volunteer, sending a broadcast) is exactly what
ought to light up that red dot via push. Today the dot is hardcoded and
`expo-notifications` isn't installed — see
[05 gap #1](./05-permissions-screen.md#6-gaps--known-issues).

---

## 8. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **The notification dot is permanently on.** A bare `<View>` with no condition (`:109`). | The Alerts tab always looks like it has something new. Users learn to ignore it, so it signals nothing — and once real notifications exist, it can never be cleared. | Drive it from unread state: `{unreadCount > 0 && <View style={styles.notifDot} />}`, or use React Navigation's built-in `tabBarBadge`. |
| 2 | **Bar height and bottom padding are hardcoded** (`80` / `22`) despite `SafeAreaProvider` being mounted in `App.js`. | On devices with a home indicator the padding may not match the inset; on Android without a gesture bar, 22 dp is wasted space. | Use `useSafeAreaInsets()` and set `paddingBottom: Math.max(insets.bottom, 8)`. |
| 3 | **Inconsistent active fill alpha.** My Helps uses `+'30'`, the other three `+'20'`. | The heart renders visibly heavier than its neighbours. | Pick one value; better, define `COLORS.primaryGreenSoft` in `theme.js`. |
| 4 | **Three hardcoded colours** — `#9CA3AF` (inactive tint), `#EF4444` (dot), `#15803D` (FAB pressed). None are in `theme.js`; `#9CA3AF` is the same literal already duplicated in `LoginScreen.js:143` and `OtpScreen.js:107`. | Design-system drift, now in four files. | Add `COLORS.disabled`, `COLORS.danger`, `COLORS.primaryGreenDark`. |
| 5 | **The FAB is unlabelled and inaccessible.** `tabBarLabel: ''` and no `tabBarAccessibilityLabel`. | Screen readers announce an unnamed tab. The app's single most important action is invisible to assistive tech. | Add `tabBarAccessibilityLabel: 'Report a help request'`. |
| 6 | **Colour-only active state.** Focus is signalled by tint, stroke width and a faint fill — no shape or label change. | The `#16A34A` / `#9CA3AF` pair is distinguishable, but the `20`-alpha fill is nearly invisible and does no work. | Keep the tint change; drop or strengthen the fill. |
| 7 | **10 dp labels at weight 700.** | Below the ~11 dp practical floor for small text; tight for longer strings and for Tamil if the UI is ever localised. | Bump to 11 dp, or drop labels on the middle tabs. |
| 8 | **String-concatenated colours** — `COLORS.primaryGreen + '20'`. | Breaks silently if the token stops being a 6-digit hex. | Use a helper (`withAlpha(hex, 0.13)`) or a named token. |
| 9 | **The report flow lives inside a tab.** Tapping another tab mid-wizard abandons progress with no warning. | Partially-entered reports are lost silently. | Either warn on tab change while the wizard is dirty, or move the flow to a modal stack screen. |

---

## 8A. What works well

- **The centre Report button reads as a FAB, not a tab** — `tabBarLabel: ''` plus a custom
  `ReportTabIcon` (`:16`) gives the green circular affordance the primary action deserves,
  without leaving the tab bar. The comment at `:15` states the intent.
  ⚠️ It is still an ordinary `Tab.Screen` (`:88–93`), so the report flow is a **tab, not a
  modal**: switching away mid-report and back returns to the same wizard step rather than
  starting fresh, and there is no dismiss gesture. Presenting it as a root-stack modal would
  match how it looks.
- **Tab labels match their screen titles**, so a user always knows where they are.
- **The profile read is centralised** — every tab reads `UserContext` rather than
  re-reading AsyncStorage, so a profile edit is reflected everywhere at once.
- **Five tabs, no overflow menu** — the whole app is one tap from anywhere.

---

## 9. QA checklist

- [ ] All five tabs are reachable and each renders its screen.
- [ ] The active tab's icon turns green with a thicker stroke; the label turns green too.
- [ ] The FAB sits above the bar line and darkens to `#15803D` when it's the active tab.
- [ ] The green glow under the FAB renders on iOS *and* the elevation shadow on Android.
- [ ] The red dot on Alerts — confirm it is currently unconditional (gap #1).
- [ ] The bar clears the home indicator on a notched iPhone and doesn't float on Android.
- [ ] Labels don't truncate — "My Helps" is the longest.
- [ ] Pushing `RequestDetails` from a tab hides the bar; back restores the same tab.
- [ ] Android back from a root tab exits the app rather than returning to Profile Setup.
- [ ] VoiceOver/TalkBack announces something meaningful for the centre button (gap #5).

---

## 10. Changing this shell

| To change… | Edit |
|---|---|
| Add/remove a tab | Add a `<Tab.Screen>` in `MainTabs.js:53–130` |
| Reorder tabs | Move the `<Tab.Screen>` blocks — order is positional |
| Bar height/padding | `screenOptions.tabBarStyle` (`:30–42`) |
| Active/inactive colours | `tabBarActiveTintColor` / `tabBarInactiveTintColor` (`:43–44`) |
| FAB size, colour, lift | `styles.fabButton` / `styles.fabButtonActive` (`:154–171`) |
| Notification dot | `styles.notifDot` (`:143–153`) and the `<View>` at `:109` |
| Label typography | `tabBarLabelStyle` (`:45–50`) |

---

**Previous:** [06 — Profile Setup](./06-profile-setup-screen.md) · **Next:** [08 — Dashboard](./08-dashboard-screen.md)
