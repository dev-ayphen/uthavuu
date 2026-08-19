# 21 — Help & Support (route name: `Settings`)

> ⚠️ **The route is called `Settings`, but the screen renders "Help & Support".** It mixes a
> support-ticket system with app preference toggles. Two different Profile menu items land
> here.

| | |
|---|---|
| **Route name** | `Settings` |
| **Header shows** | **"Help & Support"** (`:75`) |
| **Source file** | `apps/mobile/src/screens/SettingsScreen.js` (361 lines) |
| **Registered in** | `apps/mobile/App.js:101–105` |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Profile → "Help & Support / Submit Ticket" **and** Profile → "Settings" |
| **Navigates to** | Nothing — `goBack()` only |
| **Context used** | ❌ None — every toggle is local `useState` |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ ‹      Help & Support                  │
│ ┌────────────────────────────────────┐ │
│ │   ✉  Submit a Support Ticket    →  │ │
│ └────────────────────────────────────┘ │
│ MY TICKETS                             │
│ ┌────────────────────────────────────┐ │
│ │ SUP-1024 · Bug Report      [New]   │ │
│ │ Image upload failed on slow 3G     │ │
│ │ ↳ Admin: We have identified the    │ │
│ │   issue and pushed a fix.  10:32 AM│ │
│ └────────────────────────────────────┘ │
│ NOTIFICATIONS                          │
│  Push Notifications              [●──] │
│  Emergency Alerts                [●──] │
│ PRIVACY                                │
│  Location Sharing                [●──] │
│  Profile Visibility                 ›  │
│  Language                           ›  │
│ APP                                    │
│  Dark Mode                       [──○] │
│  Clear Cache                        ›  │
│ SUPPORT                                │
│  Submit a Ticket                    ›  │
│  Terms & Conditions                 ›  │
│  About                              ›  │
└────────────────────────────────────────┘
```

---

## 2. Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Persists? |
|---|---|---|---|---|---|
| 1 | **Back `‹`** | `:72` | Returns to Profile | — | — |
| 2 | **"Submit a Support Ticket" card** | `:83` | Opens the ticket modal | `showSupportModal` | — |
| 3 | **Push Notifications** switch | `:130` | Flips a local boolean. ❌ **Nothing is subscribed or unsubscribed** — `expo-notifications` isn't installed | `notifications` | ❌ Lost on unmount |
| 4 | **Emergency Alerts** switch | `:141` | Flips a local boolean only | `emergencyAlerts` | ❌ |
| 5 | **Location Sharing** switch | `:156` | Flips a local boolean only — no OS permission is touched | `locationSharing` | ❌ |
| 6 | **Profile Visibility** row | `:159` | ❌ `Alert.alert('Privacy', 'Profile visibility set to Community Verified Members only.')` — **states a setting as fact; changes nothing and offers no choice** | — | — |
| 7 | **Language** row | `:171` | ❌ `Alert.alert` listing *"• English (Selected) • தமிழ்"* — **not selectable.** No i18n exists | — | — |
| 8 | **Dark Mode** switch | `:187` | Flips a boolean. ❌ **No theme changes** — `app.json` pins `"userInterfaceStyle": "light"` | `darkMode` | ❌ |
| 9 | **Clear Cache** row | `:190` | ❌ `Alert.alert('Cache Cleared', 'App storage cache has been reset.')` — **claims success without clearing anything** | — | — |
| 10 | **Submit a Ticket** row | `:202` | Opens the same modal as #2 | `showSupportModal` | — |
| 11 | **Terms & Conditions** row | `:210` | ❌ `Alert.alert('Terms', 'Udhavu Community Guidelines & Terms of Service.')` — the title only, no actual terms | — | — |
| 12 | **About** row | `:218` | ❌ `Alert.alert('About', 'Udhavu v1.0.4\nCommunity-driven emergency assistance platform.')` | — | — |
| 13 | Existing ticket card | — | ❌ Not tappable — no thread view | — | — |

### Ticket modal

| # | Element | Line | Tap → what happens | State changed |
|---|---|---|---|---|
| 14 | ✕ close | `:237` | Closes, keeping whatever was typed | `showSupportModal` |
| 15 | **Type chip ×6** | `:248` | Selects one of Technical Problem / Bug Report / Account Problem / Feature Request / Complaint / Other | `ticketType` |
| 16 | Subject field | `:260` | Text input | `ticketSubject` |
| 17 | Description field | `:268` | Multiline input | `ticketMessage` |
| 18 | **"Cancel"** | `:275` | Closes without submitting | `showSupportModal` |
| 19 | **"Submit"** | `:278` | ✅ Validates both fields are non-empty — empty → `Alert.alert('Required Fields', …)` and stops. Valid → generates `SUP-{1000–9999}` via `Math.random()`, prepends the ticket to the list, closes the modal and clears the form | `myTickets`, form state |

---

## 3. Ticket system

```js
// :46–55
const handleSubmitTicket = () => {
  if (!ticketSubject.trim() || !ticketMessage.trim()) {
    Alert.alert('Required Fields', 'Please fill in both the Subject and Description.');
    return;
  }
  const newId = `SUP-${Math.floor(1000 + Math.random() * 9000)}`;
  const newTicket = { id: newId, type: ticketType, subject: ticketSubject.trim(),
                      status: 'New', date: 'Just now', reply: null };
  setMyTickets(prev => [newTicket, ...prev]);
  …
};
```

**This is the most complete form in the app** — required-field validation, an id, a status,
optimistic prepend, and a form reset. It is also entirely local: `myTickets` is `useState`,
so every ticket vanishes on unmount.

### 3.1 Seed ticket (`:23–33`)

| Field | Value |
|---|---|
| `id` | `SUP-1024` |
| `type` | Bug Report |
| `subject` | Image upload failed on slow 3G |
| `status` | New |
| `reply` | *"We have identified the issue and pushed a fix. Please try again."* |

A canned admin reply that arrives before any ticket is sent — and note its `status` is
still "New" despite being answered.

---

## 4. Mobile ↔ Admin web connection

**None — and the counterpart is fully built.**

The admin console has a *Support* tab (`apps/web/src/app/admin/dashboard/page.tsx:2896`)
with `MOCK_FEEDBACK` (`:295`) — 4 tickets typed Feature Request / Suggestion / Bug /
Complaint, each with a priority and status. The categories almost line up with this
screen's six.

| Mobile | Admin | Connected? |
|---|---|---|
| `TICKET_TYPES` — 6 types (`:35`) | 4 feedback types | ❌ Vocabularies differ |
| `SUP-####` via `Math.random()` | Server-side ids | ❌ Collisions possible |
| `status: 'New'` | New / In Progress / Resolved | ❌ Never transitions |
| Canned `reply` | Admin reply field | ❌ Hardcoded |

Both sides implement a support desk; neither can reach the other. The four preference
toggles have no admin counterpart at all — though `MOCK_ADMINS` (`:159`) and the 35-key
settings object (`:636`) suggest server-side settings were planned.

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Four toggles do nothing and don't persist.** Notifications, Emergency Alerts, Location Sharing and Dark Mode are local `useState` (`:13–16`), reset on every visit. | A user turns off Push Notifications, leaves, returns — it's back on. Nothing was ever subscribed. Same class of failure as [05 — Permissions](./05-permissions-screen.md#6-gaps--known-issues). | Persist via `UserContext` and wire to the real subsystems. |
| 2 | **Three alerts claim something happened when nothing did.** "Cache Cleared" (`:190`) clears nothing; "Profile visibility set to Community Verified Members only" (`:159`) sets nothing; "Terms & Conditions" (`:210`) shows a title instead of terms. | These are false statements to the user, not just stubs. Clear Cache is the worst — it confirms an action it never performed. | Implement, or say "coming soon". |
| 3 | **Dark Mode can't work.** `app.json` sets `"userInterfaceStyle": "light"`, and no theme provider exists. | A switch that will never do anything. | Remove until theming exists. |
| 4 | **Language is a read-only list.** Tamil is shown as an option but can't be picked, in an app named உதவு. | The one setting a Tamil-speaking user would most want. | Add i18n, or remove the row. |
| 5 | **Tickets are local-only and lost on unmount.** | Submitting support tickets that reach nobody is worse than having no form. | `POST /support/tickets`. |
| 6 | **`Math.random()` ticket ids** (`:49`) — 9000 possible values. | Collisions are likely at any volume. | Let the server issue ids. |
| 7 | **Two Profile menu items land here** — "Help & Support / Submit Ticket" and "Settings" ([12](./12-profile-screen.md) #13 and #16). | The menu implies two destinations. | Split into real Settings and real Support screens. |
| 8 | **Route name ≠ screen name.** `Settings` renders "Help & Support". | Anyone reading `App.js` will look for a settings screen and find a help desk. | Rename the route. |
| 9 | **The seed ticket is pre-answered.** `SUP-1024` arrives with an admin reply already attached, still marked "New". | Users think support replied to something they never sent. | Remove the seed, or mark it as a sample. |
| 10 | **Brand spelled "Udhavu"** in two alerts (`:210`, `:218`) — everywhere else it's **Uthavu**. | Inconsistent product name in user-facing text. | Fix both. |
| 11 | **Version `1.0.4`** (`:218`) — matches [12](./12-profile-screen.md) but contradicts `app.json`'s `1.0.0`. | Wrong version reported to support. | Read from `expo-constants`. |
| 12 | **Unused imports:** `MessageSquare`, `Send`, `CheckCircle2`. | Dead weight. | Remove. |

---

## 6. What works well

- **The only form in the app with required-field validation** (`:47–50`) — and it blocks
  submission rather than failing silently, unlike the report wizard's checkbox
  ([10 gap #6](./10-report-flow-screen.md#7-gaps--known-issues)).
- **The form resets after submit**, so a second ticket starts clean.
- **Optimistic prepend** puts the new ticket at the top immediately.
- **Uses `Alert.alert` correctly** rather than the global `alert()` used on
  [12](./12-profile-screen.md) and [17](./17-impact-story-screen.md).

---

## 7. QA checklist

- [ ] The header reads "Help & Support", not "Settings" (gap #8).
- [ ] Both Profile menu entries land on this same screen (gap #7).
- [ ] Submitting with an empty subject or description shows the required-fields alert.
- [ ] A valid ticket appears at the top with a `SUP-` id and "New" status.
- [ ] The form is empty when the modal is reopened.
- [ ] Leave and return — the new ticket is gone (gap #5).
- [ ] Toggle Push Notifications off, leave, return — it's back on (gap #1).
- [ ] Dark Mode changes nothing visually (gap #3).
- [ ] "Clear Cache" claims success (gap #2).
- [ ] Terms and About alerts spell the brand "Udhavu" (gap #10).

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Ticket types | `:35` — `TICKET_TYPES` |
| Seed ticket | `:23–33` |
| Submit logic / validation | `:46–58` |
| Toggle defaults | `:13–16` |
| Alert copy | `:159`, `:171`, `:190`, `:210`, `:218` |
| Screen title | `:75` |

---

**Previous:** [20 — Edit Profile](./20-edit-profile-screen.md) · **Next:** [22 — Invite Friends](./22-invite-friends-screen.md)
