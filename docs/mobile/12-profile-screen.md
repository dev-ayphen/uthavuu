# 12 — Profile (tab 5)

> **The user's own page and the app's menu hub.** Profile card, stats, impact stories,
> badges, a 9-item menu, and logout. Nine of the app's stack screens are reached from here.

| | |
|---|---|
| **Tab route** | `ProfileTab` (label **Profile**) |
| **Source file** | `apps/mobile/src/screens/ProfileScreen.js` (243 lines) |
| **Registered in** | `apps/mobile/src/navigation/MainTabs.js:114–130` |
| **Line refs valid as of** | 2026-08-18 |
| **Context used** | ✅ `useUser()` and `useFlags()` |
| **Also reachable from** | Dashboard header avatar |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ ┌────────────────────────────────────┐ │
│ │ ╭──╮  Hari            [Edit Profile]│ │ ← whole row is tappable
│ │ │ H│  🛡 Verified                   │ │
│ │ ╰──╯  📍 Anna Nagar, Chennai        │ │
│ │       👨‍💻 Software Engineer          │ │ ← only if set + public
│ │ ──────────────────────────────────  │ │
│ │      32          │       96%        │ │ ← fabricated
│ │  Total Helps     │   Reliability    │ │
│ └────────────────────────────────────┘ │
│ My Impact Stories          View All →  │
│  ▸ story row ×3                        │
│ (🏅 First Helper)(🐶 Animal Guardian)… │ ← horizontal scroll
│ ┌────────────────────────────────────┐ │
│ │ 📖 Mission Journal (My Activity)  ›│ │
│ │ ✨ My Impact Stories              ›│ │
│ │ 🚩 Flagged Requests (2)           ›│ │ ← live count
│ │ 🕐 My Active Helps                ›│ │
│ │ 🔖 Saved Stories                  ›│ │
│ │ ❓ Help & Support / Submit Ticket ›│ │
│ │ 📞 Emergency Contacts             ›│ │
│ │ 👥 Invite Friends                 ›│ │
│ │ ⚙️  Settings                       ›│ │
│ └────────────────────────────────────┘ │
│         [ 🚪 Log Out ]                 │
│           Version 1.0.4                │
│  Made with ❤️ for the community.       │
└────────────────────────────────────────┘
```

### 1.1 First-run appearance — what the card shows with an empty profile

Every field in the header falls back, so on a fresh install the card renders like this:

```
╭──╮  User        🛡 Verified          [Edit Profile]
│ H│  Location not set
╰──╯
        32          │       96%
    Total Helps     │   Reliability
```

| Element | Line | Real value | Fallback |
|---|---|---|---|
| Avatar letter | `:60` | `user.name[0]` | **`'H'`** — a leftover from "Hari" (gap #10) |
| Name | `:66` | `user.name` | **`'User'`** |
| Location | `:72` | `user.city` | **`'Location not set'`** ✅ honest |
| Profession pill | `:73–77` | `getProfessionLabel()` | **Hidden entirely** if unset or private ✅ |
| 🛡 Verified | `:67–70` | — | **Always rendered.** No condition, no data source (gap #5) |
| 32 / 96% | `:9–12` | — | **Always these literals** (gap #2) |

Three different fallback strategies in one card: `'Location not set'` states the absence
honestly, the profession pill hides itself, and the avatar invents `'H'`. Only the last is
wrong — it shows a stranger's initial.

⚠️ The contrast is sharpest here: **"Location not set" sits directly beneath a ✓ Verified
badge and 96% Reliability.** The card admits it knows nothing about the user's city while
simultaneously asserting they are verified and 96% reliable.

---

### 1.2 Assets — the impact-story thumbnails

The three story rows are **not** local to this screen. Profile imports the shared archive:

```js
import { IMPACT_STORIES } from './ImpactStoryScreen';                    // :5
…
<Image source={story.afterImage} style={styles.impactThumb} />           // :116
```

Each row renders `story.afterImage` at 44×44, `resizeMode="cover"`, from
[`IMPACT_STORIES`](./17-impact-story-screen.md#2-the-impact_stories-data-model):

| Row | Story | Image source | Path |
|---|---|---|---|
| 1 | 🐶 Puppy Rescue Completed | `injuredDogImg` | [`../../apps/mobile/src/assets/injured_dog.png`](../../apps/mobile/src/assets/injured_dog.png) |
| 2 | 🍱 75 Meals Distributed Successfully | `weddingFoodImg` | [`../../apps/mobile/src/assets/wedding_food.png`](../../apps/mobile/src/assets/wedding_food.png) |
| 3 | 🚗 Bike Breakdown Resolved | `roadsideHelpImg` | [`../../apps/mobile/src/assets/roadside_help.png`](../../apps/mobile/src/assets/roadside_help.png) |

Declared once at `ImpactStoryScreen.js:14–16` and reused by 7 screens — the app's
**only correctly shared image constants**. Compare
[13 — Category List](./13-category-list-screen.md), which re-`require`s the same three files
inline despite having module constants.

⚠️ Every row shows `afterImage`, but `afterImage === beforeImage` for all three stories, so
these thumbnails are the *before* photos — an injured dog for a story titled *"Puppy Rescue
**Completed**"*. The real after-images (`puppy_rescued.png`, `wedding_food_2.png`,
`roadside_help_2.png`) exist in the assets folder; two are never referenced at all. See
[17 gap #2](./17-impact-story-screen.md#6-gaps--known-issues) and
[ASSET-INVENTORY](../ASSET-INVENTORY.md).

**No image is stored in `docs/`** — the paths above point at the repo.

---

## 2. Interaction map — every tap target

`const rootNav = navigation.getParent() || navigation;` (`:26`) — all stack destinations go
through the parent navigator, since they live on the root stack, not the tab navigator.

| # | Element | Line | Tap → what happens | Navigates | Params |
|---|---|---|---|---|---|
| 1 | Profile card row (avatar, name, city — the whole block) | `:57` | Opens the profile editor | `EditProfile` | — |
| 2 | "Edit Profile" pill | `:80` | **Same as #1** — a nested `TouchableOpacity` inside #1, both calling `handleEditProfile` | `EditProfile` | — |
| 3 | Avatar | `:58` | Nothing of its own — inherits #1. No photo picker despite the vestigial `cameraIconBadge` style | `EditProfile` | — |
| 4 | Stats (32 / 96%) | `:88` | ❌ Not tappable. Static fabricated numbers | — | — |
| 5 | "View All →" (impact stories) | `:104` | Opens the stories list, titled "My Impact Stories" | `ImpactStories` | `{ title }` |
| 6 | Story row ×3 | `:114` | Opens that story in full | `ImpactStory` | `{ story }` — the **whole object** ✅ |
| 7 | Badge ×4 | `:131` | ❌ Not tappable. `badge.desc` exists in the data but is never rendered | — | — |
| 8 | 📖 Mission Journal (My Activity) | `:37` | Opens the private activity log | `MissionJournal` | — |
| 9 | ✨ My Impact Stories | `:38` | **Same destination as #5** | `ImpactStories` | `{ title: 'My Impact Stories' }` |
| 10 | 🚩 Flagged Requests **(n)** | `:40` | Opens the flag queue. **The count is live** — `flagged.length` from `useFlags()` | `Flagged` | — |
| 11 | 🕐 My Active Helps | `:44` | Jumps to the My Helps **tab** (not a push) | `MainTabs` | `{ screen: 'MyHelpsTab' }` |
| 12 | 🔖 Saved Stories | `:45` | Opens the same list as #5/#9, only the title differs. **No saved-items filter is applied** | `ImpactStories` | `{ title: 'Saved Impact Stories' }` |
| 13 | ❓ Help & Support / Submit Ticket | `:46` | Opens `SettingsScreen` — **identical to #16** | `Settings` | — |
| 14 | 📞 Emergency Contacts | `:47` | Fires a global `alert()`: *"Emergency Hotline: 112 / NGO Helpline: 1800-425-9999"*. **The numbers are not dialable** | — | — |
| 15 | 👥 Invite Friends | `:48` | Opens the referral screen | `InviteFriends` | — |
| 16 | ⚙️ Settings | `:49` | Opens `SettingsScreen` — **same as #13** | `Settings` | — |
| 17 | 🚪 **Log Out** | `:159` | `rootNav.replace('Login')`. **No confirmation dialog. No session cleared, no context reset, no AsyncStorage wipe** — the profile survives, so the "logged out" user is one screen away from the same data | `Login` (replace) | — |
| 18 | Version / footer text | `:165` | ❌ Not tappable. `Version 1.0.4` is hardcoded — and disagrees with `app.json`'s `"version": "1.0.0"` | — | — |

> **Three of the nine menu items are duplicates.** #9 duplicates #5; #12 duplicates #9
> except for a title string; #13 duplicates #16. Effectively six distinct destinations.

---

## 3. Data — real vs fabricated

| Element | Source | Real? |
|---|---|---|
| Avatar letter | `user.name[0] \|\| 'H'` (`:60`) | ✅ From context — but the `'H'` fallback is a leftover "Hari" hardcode |
| Name | `user.name \|\| 'User'` (`:66`) | ✅ From context |
| City | `user.city \|\| 'Location not set'` (`:72`) | ✅ From context |
| Profession pill | `getProfessionLabel()` (`:24`) | ✅ From context — respects the `showProfession` privacy toggle, returns `null` when hidden |
| "Verified" chip | Static | ❌ Always shown; no verification exists |
| Total Helps `32` | `stats` (`:9–12`) | ❌ Hardcoded |
| Reliability `96%` | `stats` (`:9–12`) | ❌ Hardcoded |
| Badges ×4 | `badges` (`:14–19`) | ❌ Hardcoded; unlocked state not modelled |
| Flagged count | `flagged.length` (`:22`, `:40`) | ✅ **Live from `FlagContext`** |
| Impact stories | `IMPACT_STORIES` (`:5`) | ❌ Static module |
| Version `1.0.4` | Literal (`:166`) | ❌ Hardcoded, contradicts `app.json` |

**This is the best context adoption in the app** — four fields plus a live count come from
real state. It's also the screen where the fabricated numbers sit right next to the real
ones, which makes the fabrication harder to notice.

### 3.1 Badges (`:14–19`)

| Icon | Label | `desc` (never rendered) |
|---|---|---|
| 🏅 | First Helper | Completed 1st mission |
| 🐶 | Animal Guardian | 10 animal rescues |
| ❤️ | Community Hero | 50 successful helps |
| 🔥 | Emergency Responder | Urgent requests |

All four render as unlocked, always. `desc` is dead data — only `icon` and `label` are used
(`:131–132`).

---

## 4. Visual specification

| Element | Spec |
|---|---|
| Screen bg | `#F8FAFC` |
| Profile card | white, border `1` `#E2E8F0`, shadow |
| Avatar | circle with the name's first letter |
| Verified chip | bg `#F0FDF4`, border `#BBF7D0`, `ShieldCheck` |
| Stats row | two cells split by a divider |
| Menu card | white, rows separated by `#F1F5F9`, `ChevronRight` on each |
| Logout | bg `#FEE2E2` with `LogOut` icon |
| Scroll padding | `paddingBottom: 120` to clear the tab bar |

`COLORS` is imported and used, but `#0F172A` and `#64748B` appear raw at `:215–216` where
`COLORS.textPrimary` / `COLORS.textSecondary` are used elsewhere in the same file.

---

## 5. Mobile ↔ Admin web connection

**None** — but this screen displays exactly what the admin console tracks per user.

| Shown here | Admin column | Source |
|---|---|---|
| Name, city | `name`, `city` / `district` | `MOCK_USERS`, `admin/dashboard/page.tsx:62` |
| Profession | `profession` | same — **admin stores the label, mobile stores the id** |
| Total Helps `32` | `helps`, `completedHelps` | same — admin's own mock numbers |
| Reliability `96%` | `reliability` | `MOCK_VOLUNTEERS:98` |
| Badges | — | Not modelled admin-side |
| Flagged count | `flags` | `MOCK_USERS` |
| "Verified" | `isVerified` | Exists in `libs/shared`'s `UserProfile` interface — which nothing imports |

Both sides invented their own numbers for the same user. The admin dashboard's row for
"Hari Krishnan" says 12 helps; this screen says 32.

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Logout doesn't log anything out.** `replace('Login')` (`:159`) with no confirm, no context reset, no AsyncStorage clear. | The next user of the device sees the previous profile intact. On a shared phone this is a privacy failure, not a bug. | Confirm dialog → clear `UserContext` + AsyncStorage → `replace('Login')`. |
| 2 | **Stats are fabricated and sit beside real data.** `32` and `96%` (`:9–12`) render in the same card as the name and city read from context. | Users have no way to tell which numbers mean anything. | Derive from real mission data, or label as demo. |
| 3 | **Three duplicate menu items.** #9≡#5, #12≡#9 (title only), #13≡#16. | A 9-item menu with 6 destinations. "Saved Stories" in particular shows *all* stories, not saved ones — `savedStore.js` exists for this and is never imported. | Wire Saved Stories to `savedStore.js`; merge the duplicates. |
| 4 | **Emergency Contacts is a bare `alert()`** (`:47`) with unclickable numbers, and uses the global `alert()` rather than RN's `Alert.alert`. | In an emergency-response app, the emergency numbers can't be dialled. | Open a proper screen with `Linking.openURL('tel:112')`. |
| 5 | **"Verified" is always shown.** | Claims a verification status that doesn't exist. | Bind to a real flag, or remove. |
| 6 | **Nested tappables.** The "Edit Profile" pill (`:80`) sits inside the card-wide `TouchableOpacity` (`:57`); both call the same handler. | RN anti-pattern; the inner press is swallowed on some platforms. | Make the card non-tappable, or drop the pill. |
| 7 | **Version `1.0.4` is hardcoded** (`:166`) and contradicts `app.json`'s `1.0.0`. | Misreported build in support conversations. | Read from `expo-constants`. |
| 8 | **Badges are decorative.** No unlock logic; `desc` never rendered. | Four permanent trophies mean nothing. | Model earned/unearned, and show `desc`. |
| 9 | **Dead code:** `useState` imported and never used (`:1`); 5 unused lucide icons — `MapPin`, `Globe`, `Edit3`, `UserCheck`, `Camera` (`:3`); dead styles `verifiedBadge`, `cameraIconBadge`. | The `Camera` import + `cameraIconBadge` style are the remains of a half-removed avatar-upload feature. | Remove, or finish the avatar upload (also missing at [06 gap #3](./06-profile-setup-screen.md#6-gaps--known-issues)). |
| 10 | **`'H'` avatar fallback** (`:60`). | A user with a blank name gets "H" — another leftover "Hari". | Fall back to `?` or an icon. |
| 11 | **Array index used as React key** (`:90`). | Minor; the list is static. | Use a stable key. |

---

## 7. What works well

- **Real context adoption** — name, city, profession and the flagged count all come from
  state, not literals. The only screen in the tab set that does this.
- **`getProfessionLabel()` respects privacy.** It returns `null` when `showProfession` is
  off, so the toggle set in Profile Setup genuinely controls this screen.
- **The flagged-count label is dynamic** (`:40`) — "Flagged Requests (2)" only shows the
  number when there is one.
- **`getParent()` is used correctly** (`:26`) for stack destinations from inside a tab.

---

## 8. QA checklist

- [ ] The name and city match what was entered in Profile Setup / Edit Profile.
- [ ] Turning off "Show profession publicly" hides the profession pill here.
- [ ] Flagging a request from Request Details increments "Flagged Requests (n)".
- [ ] All 9 menu rows navigate; confirm #9/#5, #12/#9 and #13/#16 land on the same screens.
- [ ] "My Active Helps" switches to the My Helps **tab** (bar stays visible) rather than pushing.
- [ ] "Saved Stories" shows all stories, not just saved (gap #3).
- [ ] Emergency Contacts shows an OS alert with non-tappable numbers (gap #4).
- [ ] Log Out returns to Login with no confirmation, then check that the profile survives (gap #1).
- [ ] Badges scroll horizontally and are not tappable.
- [ ] Content clears the tab bar (120 dp bottom padding).

---

## 9. Changing this screen

| To change… | Edit |
|---|---|
| Menu items | `:36–50` — the `menuItems` array |
| Stats | `:9–12` |
| Badges | `:14–19` |
| Logout behaviour | `:159` |
| Emergency numbers | `:47` |
| Version string | `:166` |
| Profile card layout | `styles.profileHeaderCard` (`:178`) |

---

**Previous:** [11 — Alerts](./11-alerts-screen.md) · **Next:** [13 — Category List](./13-category-list-screen.md)

---

## 🏁 End of the tab set

Screens 07–12 cover the entire bottom-tab experience.

| Tab | Reads real data? | Writes anything? |
|---|---|---|
| Home | ❌ All hardcoded | ❌ |
| My Helps | ❌ All hardcoded | ❌ |
| Report | Uses `hasEmail()` | ⚠️ Email only — **the report is discarded** |
| Alerts | ❌ Hardcoded, but unread state is real | ❌ Not persisted |
| Profile | ✅ Name, city, profession, flag count | ❌ |

Two of the five tabs touch real state. The one write in the whole tab set is the email
captured during the report wizard.
