# 22 — Invite Friends (stack)

> **The referral screen.** A copy-able invite link, a native share sheet and a 3-step
> explainer.
>
> **Both actions genuinely work** — real `expo-clipboard` and real `React Native Share`.
> One of only two screens in the app where a share button does something.

| | |
|---|---|
| **Route name** | `InviteFriends` |
| **Source file** | `apps/mobile/src/screens/InviteFriendsScreen.js` (174 lines) |
| **Registered in** | `apps/mobile/App.js:106–110` |
| **Line refs valid as of** | 2026-08-18 |
| **Arrives from** | Profile menu → "Invite Friends" |
| **Navigates to** | Nothing — `goBack()` only |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌────────────────────────────────────────┐
│ ‹      Invite Friends                  │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │            🎁                      │ │
│ │   Invite friends, grow the         │ │  hero card
│ │   community                        │ │
│ └────────────────────────────────────┘ │
│ Your Exclusive Invite Link             │
│ ┌──────────────────────────┬─────────┐ │
│ │ https://uthavu.org/invi… │ [📋Copy]│ │
│ └──────────────────────────┴─────────┘ │
│ ┌────────────────────────────────────┐ │
│ │      ⤴  Share Invite               │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ 1  Share your link                 │ │
│ │ 2  Friend joins Uthavu             │ │
│ │ 3  More helpers nearby             │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

---

## 2. Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Back `‹`** | `:35` | Returns to Profile | — | `goBack()` |
| 2 | **"📋 Copy"** | `:69` | ✅ **Really copies.** `await Clipboard.setStringAsync(inviteLink)` writes the URL to the system clipboard, then the button switches to a ✓ "Copied" state for **2.5 seconds** before reverting | `copied` → true, auto-false after 2500 ms | — |
| 3 | **"⤴ Share Invite"** | `:77` | ✅ **Opens the real OS share sheet** via RN's `Share.share()`, pre-filled with the message below. Errors are swallowed to `console.log` | — | External |
| 4 | Link text | — | ❌ Not tappable and not selectable — the only way to get it is #2 | — | — |
| 5 | Hero card / 🎁 | — | ❌ Nothing | — | — |
| 6 | Step rows 1–3 | `:87–90` | ❌ Nothing — static explainer | — | — |

### 2.1 The share payload

```js
// :22–25
await Share.share({
  message: `Join me on உதவு (Uthavu) — Tamil Nadu's #1 Community Help Network! Use my invite link to get started: ${inviteLink}`,
  title: 'Invite Friends to Uthavu',
});
```

Note the message is English with a Tamil app name, and makes a "#1" claim.

---

## 3. Data

```js
// :11–12
const inviteCode = 'UTHAVU-CHENNAI-2026';                        // ⚠️ never used
const inviteLink = 'https://uthavu.org/invite/UTHAVU-CHENNAI-2026';
```

| Constant | Used? | Notes |
|---|---|---|
| `inviteCode` | ❌ **Declared at `:11` and referenced nowhere else in the file** — verified by grep | The section is headed "Your Exclusive Invite Link" but no code is ever displayed |
| `inviteLink` | ✅ | Rendered, copied and shared |

**The invite code and link are the same static string for every user.** They aren't derived
from `useUser()` — this screen doesn't import it — so two users inviting friends send
byte-identical links. No referral can ever be attributed. See gap #1.

---

## 4. Visual specification

| Element | Spec |
|---|---|
| Screen bg | `#F8FAFC` |
| Hero card | dark `#0F172A` with a gift icon |
| Link row | `#F8FAFC` field + green copy button, border `#E2E8F0` |
| Copy button — copied | swaps `Copy` icon for `Check` |
| Share button | full-width, `COLORS.primaryGreen` |
| Steps card | white, numbered rows |

**Worst theme adherence in the app: 11 `COLORS.*` references against 28 raw hexes** —
`#0F172A`, `#F8FAFC`, `#E2E8F0`, `#CBD5E1`, `#F59E0B` and others are all hand-written. The
hero card, link row and steps card use no tokens at all.

Unused imports: `Image` (from react-native — **there are no images on this screen**),
`Users`, `Heart`.

---

## 5. Mobile ↔ Admin web connection

**None.** The link points at `https://uthavu.org/invite/UTHAVU-CHENNAI-2026`, a domain the
repo doesn't serve. There is no invite route in `apps/web` — the Next.js app has exactly
three routes (`/`, `/admin`, `/admin/dashboard`), so the link 404s.

Nothing is tracked: no referral record, no attribution, no admin view of who invited whom.
The admin console has no referrals tab.

Expected once wired:

```
GET  /users/me/invite        → { code, link }        per-user code
POST /invites/:code/claim    → attributes the signup
```

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **The invite link is a hardcoded constant, identical for every user** (`:12`). | Referrals cannot be attributed to anyone. The entire feature is decorative — a user shares a link that credits nobody. | Fetch a per-user code from the server; fall back to `user.id`. |
| 2 | **`inviteCode` is declared and never rendered** (`:11`). | The "Your Exclusive Invite Link" section shows only a URL. A copy-able short code is clearly intended and missing. | Render it, or delete the constant. |
| 3 | **The link 404s.** `uthavu.org/invite/…` has no route in `apps/web`. | Anyone who taps a shared link lands on nothing. | Add an invite route, or point at a store listing. |
| 4 | **No deep-link handling.** Nothing in `app.json` registers a scheme or universal link. | Even with a working URL, it couldn't open the app. | Configure `scheme` + associated domains. |
| 5 | **The link isn't selectable.** Copy is the only way to get it. | If the clipboard fails, there's no fallback. | `selectable` on the `<Text>`. |
| 6 | **Share errors are swallowed** to `console.log` (`:27`). | A failed share looks like nothing happened. | Surface a message. |
| 7 | **"Tamil Nadu's #1 Community Help Network"** in the share text (`:23`). | An unsubstantiated superlative in user-shared marketing copy. | Product/legal call. |
| 8 | **Unused imports** — `Image`, `Users`, `Heart` (`:3`, `:5`). | Dead weight. | Remove. |
| 9 | **28 raw hexes vs 11 tokens.** | Worst design-system adherence in the app. | Migrate to `theme.js`. |

---

## 7. What works well

- **Copy actually copies.** `expo-clipboard` is installed and correctly used with
  `setStringAsync` — the only screen that uses it. Compare
  [13 — Category List](./13-category-list-screen.md), whose "Copy Public Link" is an
  `alert()` stub despite the same library being available.
- **Share actually shares.** RN's native `Share.share()` opens the real OS sheet, with a
  `title` for Android.
- **The copied state auto-reverts** after 2.5 s (`:17`) — clean feedback, no stuck state.
- **`async/await` used correctly** with a `try/catch` around the share.

---

## 8. QA checklist

- [ ] "Copy" writes the URL to the clipboard — paste it elsewhere to confirm.
- [ ] The button shows ✓ "Copied" and reverts after ~2.5 s.
- [ ] "Share Invite" opens the real OS share sheet with the Tamil-name message.
- [ ] Cancelling the share sheet doesn't crash or leave a stuck state.
- [ ] The invite link is identical on a second device (gap #1).
- [ ] Opening the shared link in a browser 404s (gap #3).
- [ ] No invite **code** is visible anywhere despite the heading (gap #2).

---

## 9. Changing this screen

| To change… | Edit |
|---|---|
| Invite code / link | `:11–12` |
| Share message | `:23` |
| Copy feedback duration | `:17` — the `2500` literal |
| Explainer steps | `:87–90` |
| Hero card styling | `styles.heroCard` |

---

**Previous:** [21 — Help & Support](./21-settings-screen.md) · **Next:** [23 — Shared components](./23-shared-components.md)
