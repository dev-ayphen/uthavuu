# 02 — Dashboard shell

> **The frame around all 22 tabs** — header, collapsible sidebar, role gate and theme
> system. Everything in docs 03–10 renders inside this shell.

| | |
|---|---|
| **Route** | `/admin/dashboard` |
| **Source file** | `apps/web/src/app/admin/dashboard/page.tsx` (4,890 lines) |
| **Line refs valid as of** | 2026-08-18 |
| **Component type** | Client (`'use client'`, `:2`) |
| **Structure** | `AdminDashboardPage` (`:507`) → `React.Suspense` → `AdminDashboardContent` (`:539`) |
| **Auth guard** | ❌ **None** |
| **Server calls** | **None** — every mutation is `useState` on a `MOCK_*` array |

The `Suspense` wrapper is required because `useSearchParams()` (`:540`) suspends during
static rendering.

---

## 1. Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ ♡  Uthavu Admin (உதவு) [Super Admin]   ● System Operational  ☀ Light │
│    admin.uthavu.org • Live Control Panel                    [Logout] │
├────────────┬─────────────────────────────────────────────────────────┤
│ MENU       │                                                         │
│ ▸ Dashboard│                                                         │
│ ▸ Users  8 │                 active tab renders here                 │
│ ▾ Reports 9│                                                         │
│   All Rep. │                                                         │
│   Flagged 8│                                                         │
│   Comments │                                                         │
│ ▸ Community│                                                         │
│ ▸ Analytics│                                                         │
│ ▸ Platform │                                                         │
│ ▸ Monetiz. │                                                         │
│ ▸ Admin  3 │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
   w-56, collapses to an off-canvas drawer below md
```

---

## 2. Interaction map — shell chrome

| # | Element | Line | Interaction → what happens | State changed |
|---|---|---|---|---|
| 1 | **☰ menu button** (mobile only) | `:880` | Toggles the off-canvas sidebar. Hidden at `md` and above | `sidebarOpen` |
| 2 | Scrim behind the drawer | `:934` | Tap to close | `sidebarOpen` → false |
| 3 | Logo / "Uthavu Admin (உதவு)" | `:884` | ❌ Not a link | — |
| 4 | Role badge | `:901` | ❌ Display only — green "Super Admin" or amber "Ops Moderator" | — |
| 5 | "● System Operational" | `:909` | ❌ Display only. A pulsing green dot, **hardcoded** — not derived from the System Health tab | — |
| 6 | **☀/🌙 theme toggle** | `:912` | ✅ **Really switches theme** and persists to `localStorage` | `dark` |
| 7 | **Logout** | `:917` | `<Link href="/admin">` — navigates to the login page. ❌ **Clears nothing** (there is no session) | — |
| 8 | **Sidebar group header** | `:962` | Expands/collapses that group via `toggleGroup`. ⚠️ **Not a strict accordion** — see §2.2 | `expandedGroup` |
| 9 | **Sidebar item** | via `nav()` | Switches tab **and clears all detail selections** | `activeTab` + 5 selections |
| 10 | Sidebar badges | `:826–866` | ❌ Display only — counts derived from live state | — |

### 2.0 Sidebar footer — System Status widget (`:1010–1015`)

Pinned to the bottom of the sidebar, below the menu:

```
┌─────────────────────────┐
│ System Status           │  11px, semibold
│ ● App Backend Online    │  10px, emerald
│ Chennai Region • v2.1.0 │  9px, muted
└─────────────────────────┘
```

| Line | Element | Source |
|---|---|---|
| `:1013` | "System Status" | Static |
| `:1014` | **"● App Backend Online"** | **Hardcoded** — always green, always online |
| `:1015` | "Chennai Region • v{version}" | ✅ **Derived** — `v{settings.appVersion}` from the settings object |

Two observations:

1. **"App Backend Online" is a hardcoded string.** There is no backend — zero API calls
   exist in either product. It is the **third** permanently-green status indicator in the
   console, alongside the header's "● System Operational" and the System Health tab, which
   simultaneously reports SendGrid as *Degraded*.
2. **The version genuinely derives** from `settings.appVersion`, so editing App Settings →
   App Version updates this widget live. It's the only place a settings value visibly
   affects the UI — which makes the fact that ["Save All Settings" persists nothing](./07-platform-settings.md#21-interaction-map)
   easy to miss: the change appears to take effect.

> Note the version shown here (`2.1.0` by default) disagrees with the mobile app, which
> hardcodes `1.0.4` on two screens and declares `1.0.0` in `app.json` —
> [mobile 12 gap #7](../mobile/12-profile-screen.md#6-gaps--known-issues). **Three different
> version numbers across the two products.**

### 2.1 `nav()` clears detail state

```ts
// :722
const nav = (tab: Tab) => {
  setActiveTab(tab);
  setSelectedUser(null); setSelectedReport(null); setSelectedVolunteer(null);
  setSelectedStory(null); setCreatingStoryFor(null);
  setSidebarOpen(false);
};
```

Correct behaviour — switching tabs can't leave a stale detail panel open, and the mobile
drawer closes itself.

---

## 3. 🔴 The role gate

```ts
// :540–542
const searchParams = useSearchParams();
const roleParam = searchParams.get('role');
const isSuperAdmin = roleParam !== 'ops';
```

**One line, and it fails open.** `isSuperAdmin` is true for:

| URL | `roleParam` | Result |
|---|---|---|
| `/admin/dashboard?role=super` | `'super'` | ✅ Super Admin |
| `/admin/dashboard` | `null` | ✅ **Super Admin** — no login required |
| `/admin/dashboard?role=anything` | `'anything'` | ✅ **Super Admin** |
| `/admin/dashboard?role=ops` | `'ops'` | Ops Moderator — **the only restricted state** |

There is **no auth guard**: no middleware, no session check, no redirect. Navigating
directly to `/admin/dashboard` renders the full console with Super Admin privileges. See
[01 §4](./01-admin-login.md#4--security-assessment).

Ops is opt-in via a query string the user controls, so the restriction is advisory.

---

## 4. Sidebar structure

`SIDEBAR_GROUPS` (`:816–870`) — 8 groups, 18 reachable tabs.

| Group | Type | Tabs | Badge source |
|---|---|---|---|
| **Dashboard** | single | `dashboard` | — |
| **Users** | single | `users` | `users.length` |
| **Reports** | expandable | `reports` · `flagged` · `comments` | `openReports + pendingFakes + pendingFlags` |
| **Community** | expandable | `impact-stories` · `updates` · `broadcast` | per-item |
| **Analytics** | single | `analytics` | — |
| **Platform** | expandable | `categories` · `settings` · `feedback` · `system-health` · `audit-logs` | `newFeedback` on Support |
| **Monetization** | expandable | `monetization-overview` · `monetization-admob` · `monetization-sponsors` | — |
| **Admin** | single | `admins` | `admins.length` |

### 4.1 Badges are genuinely derived

```ts
// :811–814
const openReports  = reports.filter(r => r.status === 'Open').length;
const pendingFakes = fakeReports.length;
const pendingFlags = flags.length;
const newFeedback  = feedback.filter(f => f.status === 'New').length;
```

These recompute from live state, so resolving a report in the Reports tab decrements the
sidebar badge immediately. `|| undefined` hides a badge at zero rather than showing "0".

### 2.2 Two groups can be open at once

```ts
// :877 — the toggle keeps only ONE manually-expanded group
const toggleGroup = (key: string) => setExpandedGroup(prev => prev === key ? null : key);

// :934 — but a group is ALSO open whenever it contains the active tab
const isOpen = expandedGroup === group.key || isGroupActive;
```

So the sidebar is **not a strict accordion**. Two groups render expanded simultaneously
whenever the manually-expanded group differs from the one containing the active tab.

**Confirmed on device:** a screenshot with the **Categories** tab active shows **Platform
expanded** (because it holds the active tab) *and* **Reports expanded** (because it was the
last group clicked) — five sub-items visible under Platform and three under Reports at the
same time.

| Group | Why it's open |
|---|---|
| Platform | `isGroupActive` — contains the active `categories` tab |
| Reports | `expandedGroup` — the last header clicked |

This is sensible behaviour — you never lose sight of where you are — but it means at most
**two** groups are open, and the manually-expanded one cannot be collapsed while it is also
the active group (clicking it sets `expandedGroup` to `null`, but `isGroupActive` keeps it
open).

`isGroupActive` also drives the emerald highlight on the group icon and label (`:941`,
`:946`, `:964`, `:969`) and rotates the chevron (`:976`).

### 4.2 Active-group detection

```ts
// :872–874
const activeGroupKey = SIDEBAR_GROUPS.find(g =>
  g.single ? g.tab === activeTab : g.items?.some(i => i.id === activeTab)
)?.key ?? 'dashboard';
```

The containing group auto-expands when its tab is active — so reaching `volunteers` from a
user record leaves the sidebar with **no group highlighted** (it belongs to none), falling
back to `'dashboard'`.

**4 tabs are missing from the sidebar entirely** — see
[10 — Unreachable tabs](./10-unreachable-tabs.md).

---

## 5. ✅ Dark mode — fully working

Unlike the mobile app, the admin console has a **real, persisted theme system**.

```ts
// :718–719
const toggleDark = useCallback(() => {
  setDark(d => {
    const next = !d;
    localStorage.setItem('uthavuAdminTheme', next ? 'dark' : 'light');
    return next;
  });
}, []);
```

```ts
// :545–556 — restore on mount, deferred to avoid a hydration mismatch
const [dark, setDark] = useState<boolean>(true);          // dark by default
useEffect(() => {
  const timer = setTimeout(() => {
    const saved = localStorage.getItem('uthavuAdminTheme');
    if (saved) setDark(saved === 'dark');
  }, 0);
  return () => clearTimeout(timer);
}, []);
```

Theme tokens (`:792–800`) are derived class strings threaded through every component:

| Token | Dark | Light |
|---|---|---|
| `bg` | `bg-slate-950` | `bg-slate-100` |
| `bgCard` | `bg-slate-900/90` | `bg-white` |
| `bgCard2` | `bg-slate-800/80` | `bg-slate-200/70` |
| `border` | `border-slate-800` | `border-slate-300` |
| `text` | `text-slate-100` | `text-slate-900` |

### 5.1 Compare with mobile

| | Admin console | Mobile app |
|---|---|---|
| Dark mode | ✅ Works | ❌ Impossible |
| Persisted | ✅ `localStorage` | ❌ Local `useState`, reset on unmount |
| Default | **Dark** | Light, pinned by `app.json` |
| Theme system | Derived token strings | One flat `COLORS` object, no variants |

The mobile Settings screen has a Dark Mode switch that does nothing
([mobile 21 gap #3](../mobile/21-settings-screen.md#5-gaps--known-issues)). **The admin
console proves the pattern the app needs** — a toggle, a persisted preference, and tokens
rather than literals.

> Note the `setTimeout(…, 0)` at `:547` is a hydration workaround: reading `localStorage`
> during render would mismatch the server-rendered HTML. A cookie or an inline
> `<script>` in `layout.tsx` would avoid the flash of dark-then-light on load.

---

## 6. State inventory

All data is `useState` seeded from a `MOCK_*` constant (`:559–575`). **No fetch anywhere.**

| State | Seed | Mutable? |
|---|---|---|
| `users` | `MOCK_USERS` | ✅ |
| `reports` | `MOCK_REPORTS` | ✅ |
| `fakeReports` | `MOCK_FAKE_REPORTS` | ✅ |
| `flags` | `MOCK_FLAGS` | ✅ |
| `volunteers` | `MOCK_VOLUNTEERS` | ❌ **No setter** — `const [volunteers] = useState(…)` |
| `updates`, `comments`, `categories` | respective mocks | ✅ |
| `notifications`, `impactStories`, `admins` | respective mocks | ✅ |

Every change is lost on refresh — there is no persistence layer beyond the theme preference.

---

## 7. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **No auth guard.** `/admin/dashboard` renders for anyone. | The console is public. | Guard `/admin/*` in Next.js middleware. |
| 2 | **The role gate fails open** (`:542`). Anything but `'ops'` — including no param — is Super Admin. | Privileges are self-granted from the URL. | Derive the role from a signed session; default to the *least* privilege. |
| 3 | **Logout clears nothing** (`:917`). | A `<Link>` to the login page. Back-button returns to the console. | Clear the session server-side and redirect. |
| 4 | **Three hardcoded "everything is fine" indicators.** The header's "● System Operational" (`:909`), the sidebar footer's **"● App Backend Online"** (`:1014`), and the System Health tab — which simultaneously reports SendGrid as *Degraded*. | Two permanently-green badges that can never show a problem, and one of them asserts a backend is online when **no backend exists**. Directly contradicts the tab built to report health. | Derive both from `MOCK_SYSTEM_HEALTH`; remove the backend claim until there is one. |
| 5 | **Tab state isn't in the URL.** `activeTab` is `useState` (`:555`), never synced to the query string. | No deep links, no shareable views, and refresh always returns to Dashboard. | Sync to `?tab=`. |
| 6 | **`volunteers` has no setter** (`:564`). | The Volunteers tab is read-only by construction — no suspend, verify or reassign. | Add the setter when the actions are built. |
| 7 | **4 tabs are missing from the sidebar.** | ~150 lines of built UI unreachable. | [10 — Unreachable tabs](./10-unreachable-tabs.md). |
| 8 | **Theme restore uses `setTimeout(0)`** (`:547`). | A brief flash of the wrong theme on load for light-mode users. | Cookie, or a blocking inline script. |
| 9 | **4,888 lines in one file** with 22 tabs, ~19 mock arrays and 6 chart components inline. | Very hard to navigate, review or test. | Split per tab into route segments. |
| 10 | **No loading or error states.** | Nothing is async yet; no pattern exists for when the API lands. | Decide the pattern before wiring. |

---

## 7A. Mobile ↔ Admin connection

**None. The shell holds every admin surface, and not one of them reads or writes app data.**

### 7A.1 What the shell would carry

| Shell concern | Mobile equivalent | Status |
|---|---|---|
| Sidebar badge counts | Live report/flag counts from the API | 🔵 Derived from `MOCK_*` arrays |
| Role gate | Staff permissions from a token | 🔴 `roleParam !== 'ops'` — self-granted |
| Theme (`uthavuAdminTheme`) | Mobile has **no theme system** — light only | ⚪ Deliberately separate |
| Global search | Cross-entity search over reports/users | 🔵 Not built |
| Real-time updates | WebSocket / SSE push from missions | 🔵 Not built — nothing refreshes |

### 7A.2 The two apps share **zero code**

Verified: `libs/shared/src/index.ts` exports **3 TypeScript interfaces that nothing
imports**, and `apps/web/package.json` does not list `libs/shared` as a dependency at all.

Consequences visible in the shell:

- The `Tab` union (`:515`) names 22 surfaces; mobile names its screens independently in `App.js`
- Every `MOCK_*` array is re-declared in `page.tsx`, duplicating shapes the app also declares
- A field renamed on one side breaks nothing on the other, because nothing connects them —
  which is why the two ends have drifted (see [07 §5A](./07-platform-settings.md#5a--mobile--admin-connection))

### 7A.3 The one thing the shell must gain first

Every other integration depends on knowing **who is acting**. As built, the shell trusts a
query parameter. Before any endpoint is wired, `isSuperAdmin` has to come from a verified
token — otherwise every write the console gains is an unauthenticated write.

See [01 §6A.2](./01-admin-login.md#6a2-what-a-real-integration-needs) and
[API-CONTRACT](../API-CONTRACT.md).

---

## 8. What works well

- **Real, persisted dark mode** — the one thing the mobile app most needs and doesn't have.
- **Sidebar badges derive from live state**, so moderation actions update the navigation
  immediately, and `|| undefined` suppresses zeroes.
- **`nav()` clears every detail selection**, preventing stale panels across tab switches.
- **Auto-expanding active group** keeps the sidebar oriented.
- **Responsive by construction** — the sidebar becomes an off-canvas drawer with a scrim
  below `md`, and the drawer closes on navigation.
- **`Suspense` is correctly placed** around the `useSearchParams` consumer.

---

## 9. QA checklist

- [ ] Navigate directly to `/admin/dashboard` — it renders as Super Admin (gap #1, #2).
- [ ] `?role=ops` shows the amber "Ops Moderator" badge.
- [ ] `?role=anything` shows "Super Admin".
- [ ] Toggle the theme, refresh — the choice persists.
- [ ] Watch for a flash of dark before light on load in light mode (gap #8).
- [ ] Expanding a sidebar group collapses the previously open one.
- [ ] Opening a user detail then switching tabs clears the detail panel.
- [ ] Resolve a report — the Reports badge decrements.
- [ ] Below `md`, ☰ opens the drawer; the scrim and any nav item close it.
- [ ] Logout returns to `/admin`; pressing back re-enters the console (gap #3).
- [ ] "System Operational" stays green while System Health shows SendGrid degraded (gap #4).

---

## 10. Changing the shell

| To change… | Edit |
|---|---|
| Sidebar groups / items | `:816–870` — `SIDEBAR_GROUPS` |
| Role gate | `:542` |
| Theme tokens | `:792–800` |
| Theme persistence | `:718–719`, `:545–556` |
| Header chrome | `:878–925` |
| Tab-switch side effects | `:722` — `nav()` |
| Default tab | `:555` |

---

**Previous:** [01 — Admin Login](./01-admin-login.md) · **Next:** [03 — Dashboard & Users](./03-dashboard-and-users.md)
