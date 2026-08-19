# Uthavu — Master Flow: Mobile ↔ Backend ↔ Admin

> ⚠️ **Not actually verified — see `docs/README.md` for the full correction.** No prototype code
> exists anywhere — neither product is actually built. Every citation/status below was fabricated
> by an earlier agent run.

The single reference for how every feature *should* travel between the two products.

**~~Verified against code~~:** 2026-08-18

> ⚠️ **Neither product exists yet**, not just "the middle layer." Every 🔵 below is a target, not
> a description of anything real.

---

## The architecture

```
                         UTHAVU SYSTEM
                              │
              ┌───────────────┴────────────────┐
              │                                │
         MOBILE APP                        ADMIN WEB
              │                                │
              └──────────────┬─────────────────┘
                             │
                       API / BACKEND
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
      Users               Reports              Missions
        │                    │                    │
    Profiles           Flags/Comments         Volunteers
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                       Notifications
                             │
                    ┌────────┴────────┐
                    │                 │
                 Stories          Analytics
                    │                 │
                 Sponsors           Events
                    │
                  AdMob
```

**The golden rule: mobile and admin never talk to each other.** Every interaction goes
through the backend.

```
Mobile: user reports injured dog
              ↓
        POST /reports
              ↓
     Backend / database
              ↓
Admin: Reports → All Reports
```

### The four questions

For any feature, all four must have an answer. If one is missing, the feature is not
connected.

1. **Where does the user perform the action?**
2. **Which API receives it?**
3. **Where is it stored?**
4. **Where can admin view or manage it?**

Today **question 2 and 3 are unanswered for every feature in the product.**

---

## Status legend

🟢 Built · 🟡 Partially built · 🔵 Target — not built · ❌ Contradicts the target

---

## 1. Authentication & users

| Layer | Flow |
|---|---|
| **Mobile** | Splash → Onboarding → Login → Phone → OTP → Permissions → Profile Setup → Home |
| **Backend** | `POST /auth/otp/request` → `POST /auth/otp/verify` → session token |
| **Admin** | Users → Users List → User Details |

```
users
 ├── id · phone · name · email · photo
 ├── city · area · latitude · longitude
 ├── interests[] · profession · organization
 ├── status (active | suspended | blocked)
 └── created_at · last_login · device
```

| Element | Status | Note |
|---|---|---|
| Mobile flow | 🟢 | All 6 screens built |
| OTP send / verify | 🔵 | **No code is sent; any 6 digits pass** |
| Session / token | 🔵 | None exists |
| Admin user list | 🟡 | Built on `MOCK_USERS` (8 records) |
| Suspend / unsuspend | 🟡 | Real state change, local only |
| Delete user | 🟡 | Role-gated ✅ — the only enforced permission |

⚠️ **`phone` is never stored by mobile** — Login doesn't pass it to OTP, and OTP hardcodes
a display number. Admin keys users by phone.

## 2. Profile

| Layer | Flow |
|---|---|
| **Mobile** | Profile → Edit Profile → Save |
| **Backend** | `PATCH /users/me` |
| **Admin** | Users → User Details |

| Element | Status |
|---|---|
| Profile Setup writes 9 fields | 🟢 AsyncStorage |
| **Edit Profile writes 21 fields** | 🟢 **`EditProfileScreen.js:66` calls `updateUser({…})` and persists** |
| Sync to backend | 🔵 |
| Photo upload | 🔵 5 entry points, 0 captures |

> ✏️ **Correction — raised four times now.** *"EditProfileScreen is disconnected from
> `UserContext`"* is **false**. It is one of only two real write paths in the app. Its
> actual defects are **no validation on any of the 14 fields**, empty photo handlers, and
> `phone` displayed but omitted from the payload — [20](./mobile/20-edit-profile-screen.md).

## 3. Reports — the most important flow

| Layer | Flow |
|---|---|
| **Mobile** | Home → ＋ Report → Category → Describe → Photo → Location → Urgency → Privacy → Publish |
| **Backend** | `POST /reports` |
| **Admin** | Reports → All Reports → Report Details |

```
reports
 ├── id · user_id · category_id
 ├── title · description · image[]
 ├── latitude · longitude · city · area
 ├── urgency · status · created_at · expires_at
 └── anonymous · phone_visible · share_ngo
```

| Element | Status |
|---|---|
| 3-step wizard | 🟢 Built |
| Expiry rules (9 categories) | 🟢 Real rule engine |
| **Publish → save** | 🔵 **The report is discarded. Nothing is saved anywhere** |
| Camera capture | 🔵 Both buttons have no `onPress` |
| Admin report list + detail | 🟡 Built on `MOCK_REPORTS` (8 records) |

🔴 **This is the single most consequential gap in the product.** Everything downstream —
dashboard counts, My Helps, category lists, admin reports, analytics — is fiction because
this write never happens.

## 4. Admin moderation → mobile

| Layer | Flow |
|---|---|
| **Admin** | Reports → Report Details → Approve · Hide · Delete · Mark Fake · Suspend reporter |
| **Backend** | `PATCH /reports/:id { status }` |
| **Mobile** | Hidden reports disappear from the feed |

| Action | Status |
|---|---|
| Mark Open / Fake / Cancelled | 🟡 Real state; list + panel stay in sync ✅ |
| **Suspend reporter** | ❌ **Alerts "User suspended" — the user stays Active** |
| Issue warning | ❌ Alert only; `warnings` never increments |
| Reflect back to mobile | 🔵 No channel exists |

## 5. Flags & moderation

| Layer | Flow |
|---|---|
| **Mobile** | Request Details → 🚩 → pick 1 of 7 reasons → Submit |
| **Backend** | `POST /flags` |
| **Admin** | Reports → Flagged Reports |

| Element | Status |
|---|---|
| 7-reason flag modal | 🟢 Reason captured correctly |
| Quick 🚩 on a list card | 🟡 **Reason silently lost** — defaults to `'Reported by user'` |
| Persistence | 🔵 **In-memory; erased on reload** |
| Admin flag queue | 🟡 `MOCK_FLAGS` (5) + `MOCK_FAKE_REPORTS` (3) |

⚠️ **Vocabularies don't match** — mobile has 7 reasons, admin has 5; only *Spam* and
*Duplicate* align. Must be reconciled before wiring.

🔴 The app tells the user *"Uthavu Admins will review this report in the Flagged Reports
queue."* That queue has never received anything.

## 6. Comments

Per [Decision 2](./PRODUCT-DECISIONS.md#decision-2--community-comments-public--mission-chat-private):

| Surface | Who | Visibility |
|---|---|---|
| **Community Comments** | Anyone | Public |
| **Mission Chat** | Reporter + accepted volunteers | Private |

| Layer | Flow |
|---|---|
| **Mobile** | Post → Comments → Add Comment · Report Comment |
| **Backend** | `POST /comments` · `POST /flags` |
| **Admin** | Reports → Comments |

| Element | Status |
|---|---|
| Public comments on an active request | 🔵 **Not built** |
| Flag a comment | 🔵 Not wired |
| Admin comment moderation (hide / delete) | 🟢 **Built and working** |

✅ The admin side is **correct as built** — it moderates exactly the surface public comments
require.

## 7. Nearby discovery — GPS + radius

| Layer | Flow |
|---|---|
| **Mobile** | GPS → Velachery, Chennai → radius 5 km → matching requests only |
| **Backend** | `GET /reports?lat=…&lng=…&radius=5` |
| **Admin** | Analytics → district performance |

```
Animal Rescue — 2.1 km   ✅
Medical Help  — 3.4 km   ✅
Roadside Help — 4.7 km   ✅

Trichy  — 200 km  ❌ never
Madurai — 450 km  ❌ never
```

| Element | Status |
|---|---|
| Location + radius as the default | 🟢 Already the model |
| Radius selector 1/3/5/10 km | 🟢 |
| **Real GPS** | 🔵 `expo-location` not installed — location is a string literal |
| Distance-based query | 🔵 Client filters a mock array by a parsed string |

## 8. Explore Another Location

| Element | Status |
|---|---|
| Secondary, not the default feed | 🟢 Reached only from the radius sheet |
| Search city / area | 🟡 Filters 5 popular areas; **no geocoding** |
| Recent / suggested | 🟢 2 recent + 5 popular |
| **"Exploring X — not your location"** | 🟢 **Built** — blue banner + Reset GPS |
| Choose radius, then **Apply** | 🔵 Selection applies immediately; no Apply step |
| Never changes actual GPS | ✅ Correct — exploring is separate state |

## 9. Volunteer accepts

| Layer | Flow |
|---|---|
| **Mobile** | Request Details → I'll Help → *"Complete alone?"* → Yes / No → volunteers needed (2–20) → Confirm |
| **Backend** | `POST /missions/:id/volunteers` |
| **Admin** | Mission Details → Volunteer Assignment |

| Element | Status |
|---|---|
| Accept flow + needed-count stepper | 🟢 Clamped 2–20 ✅ |
| Roster updates | ❌ **`setVolunteers` is never called** — the roster is immutable |
| Admin mission view | 🟡 `MOCK_VOLUNTEERS`, **read-only by construction** |

## 10. Volunteer starts helping

| Layer | Flow |
|---|---|
| **Mobile** | Volunteer Journey → Start Helping |
| **Backend** | `PATCH /missions/:id { status: 'in_progress' }` |
| **Admin** | Mission → Status: In Progress |

| Element | Status |
|---|---|
| **15-minute auto-release rule** | 🟢 **Fully implemented** — the only product rule that is |
| Lifecycle transitions | 🟡 Local `useState` |
| **"I cannot continue (Release)"** | ❌ **Calls `goBack()` — the request is never released** |
| Admin sees status | 🔵 |

## 11. Team join

| Element | Status |
|---|---|
| + Join Team | ❌ **Appends from a fixed list** — `['Arun','Lakshmi','Ravi','Kumar']` |
| Real join | 🔵 |
| Admin team view | 🟡 Mock |

⚠️ Hardcoded volunteers must not ship.

## 12. Mission chat

| Layer | Flow |
|---|---|
| **Mobile** | Mission → Chat → Send |
| **Backend** | `messages { mission_id · sender_id · message · timestamp }` |
| **Admin** | Moderation access only — for safety, abuse and investigation |

**Lifecycle (Rule 15):** `Accepted → 💬 unlocked → Completed → 🔒 locked → Read Only → Archived`

| Element | Status |
|---|---|
| Unlocks only after accepting | 🟢 Gated on `hasAccepted` |
| **Never exposes a phone number** | 🟢 Chat and phone are separate; phone needs opt-in |
| Works when phone sharing is OFF | 🟢 Labelled "Always on" |
| No permanent Chat tab | 🟢 Correct — chat lives on the mission |
| Chat modal input | 🟡 `<Text>` placeholder on Request Details; real `TextInput` on Volunteer Journey |
| **Locks read-only on completion** | ❌ **The card is hidden entirely — history is unreachable** |
| Delivery / persistence | 🔵 **Messages go nowhere** |

⚠️ `!isCompleted` (`:518`) *hides* rather than *locks*. Rule 15 requires past messages to
stay viewable — see [14 §1C](./mobile/14-request-details-screen.md#1c-mission-temporary-chat--lifecycle--privacy).

Admin should **not** be part of normal conversations — access is for moderation only.

## 13. Mission completion

| Layer | Flow |
|---|---|
| **Mobile** | Complete Help → **Camera** → capture proof → note → Submit |
| **Backend** | `POST /missions/:id/complete` → verification → `COMPLETED` |
| **Admin** | Mission → Completed → verification details |

| Element | Status |
|---|---|
| Completion form + note | 🟢 |
| **Live camera capture** | 🔵 **Not implemented — no photo is required** |
| **Automated verification** | 🔵 A `setTimeout` that greps caption text |
| Admin verification view | 🟡 Displays a timeline for a pipeline that never ran |

🔴 Rule 1 requires live-camera proof. A mission closes today with no evidence.

## 14. Impact Story

| Layer | Flow |
|---|---|
| **Backend** | Mission verified → generate story |
| **Mobile** | Impact Story → View → Share |
| **Admin** | Community → Impact Stories → Review · Publish · Hide · Delete |

| Element | Status |
|---|---|
| Story detail — carousel, before/after, note | 🟢 |
| Generated on completion | 🟡 Built from a hardcoded literal, not the real mission |
| **Admin create a story** | ❌ **Impossible — both entry points are dead** |
| Admin hide / delete | 🟡 Delete works; feature-toggle is an alert |
| Mobile respects `status` | 🔵 **No concept of an unpublished story** |

## 15. Share

| Layer | Flow |
|---|---|
| **Mobile** | Story → Share → WhatsApp · Facebook · Instagram · More · Copy Link |
| **Backend** | `POST /stories/:id/share` |
| **Admin** | Analytics → views · shares |

| Element | Status |
|---|---|
| Share implementation | 🟢 **Best-engineered code in the app** — deep links + fallbacks + clipboard |
| Share on 3 other screens | ❌ `alert()` stubs |
| **Share event recorded** | 🔵 **Never** — admin's `shares` counter can't move |
| Shared URL resolves | ❌ `uthavuu.org` has no route |

## 16. Support tickets

| Layer | Flow |
|---|---|
| **Mobile** | Profile → Help & Support → type → subject → description → Submit |
| **Backend** | `POST /support/tickets` |
| **Admin** | Platform → Support → New / In Review / Resolved |

| Element | Status |
|---|---|
| Mobile ticket form | 🟢 **Required-field validation with a named error** |
| Persistence | 🔵 Local `useState` |
| Admin reply | 🟡 Status changes; **the reply text is discarded** |
| Mobile sees the reply | 🔵 |

✅ **Both ends built.** This is the cleanest candidate for the first real integration.

## 17. Notifications — backend → mobile

```
Report created in Velachery
        ↓
Backend finds volunteers within radius
        ↓
🚨 New help request nearby · Injured dog · 2.1 km away
```

| Trigger | Recipient | Status |
|---|---|---|
| New nearby request | Volunteers in radius | 🔵 |
| Volunteer accepted | Reporter | 🔵 |
| Mission completed | Reporter | 🔵 |

| Element | Status |
|---|---|
| `expo-notifications` | ❌ **Not installed** |
| Push token registration | ❌ Permissions screen requests nothing |
| Mobile Alerts screen | 🟡 7 hardcoded alerts; unread state is real |
| Notification dots | ❌ **Permanently on, hardcoded** — 2 places |

Admin does **not** send these individually — the backend triggers them.

## 18. Admin broadcast — admin → mobile

| Layer | Flow |
|---|---|
| **Admin** | Community → Broadcasts → Create → title · message · type · district |
| **Backend** | broadcast → notification service |
| **Mobile** | Alerts → Emergency Broadcast |

| Element | Status |
|---|---|
| Compose + validate + publish | 🟢 **Most complete flow in the console** |
| Live mobile preview | 🟢 Truncates at 60 chars like a real push |
| District targeting | 🟢 Stored |
| **Delivery** | 🔵 **Reaches nobody** |

## 19. Categories — admin → mobile

| Element | Status |
|---|---|
| Admin add category | 🟡 **Captures only a name** — icon, image, colour hardcoded |
| Enable / disable | 🟢 Local state |
| Rename / delete | ❌ Not possible |
| **Mobile reads the list** | 🔵 **Mobile hardcodes its own 8 (9 in the wizard)** |

⚠️ Categories are defined twice. Disabling one admin-side has no effect on the app.

## 20. Settings — admin → mobile

| Element | Status |
|---|---|
| 35 settings editable (+11 dead toggles) | 🟡 In state |
| **Save** | ❌ **`alert()` — everything reverts on refresh** |
| Mobile reads config | 🔵 Never |

Affected: `defaultRadius` · `expiryHours` · `maxPhotos` · `maxVolunteers` · `flagLimit` ·
`imageModeration` · **`maintenanceMode`** — enabling it does nothing.

## 21. Monetization — admin → mobile

**AdMob** — Google supplies the ads; Uthavu controls configuration only.

| Element | Status |
|---|---|
| 6 placements, enable/disable | 🟢 In state |
| Ad unit IDs | ❌ **Google's public test IDs** |
| Mobile reads config | 🔵 |
| AdMob SDK in mobile | ❌ Not installed |

**Sponsors** — Uthavu sells and places these directly.

| Element | Status |
|---|---|
| 6-step campaign wizard | 🟢 Built · ❌ **9 `*` fields, none enforced** |
| Video upload | ❌ Simulated |
| Mobile reads campaigns | 🔵 **Mobile has its own 2 hardcoded sponsors** |
| Impressions / clicks | 🔵 Never reported |

✅ **Placement keys already match** between the two — the lowest-effort integration.

## 22. Analytics — events

```
Mobile action → analytics event → admin dashboard
```

`report_created` · `report_viewed` · `mission_accepted` · `mission_started` ·
`mission_completed` · `story_viewed` · `story_shared` · `support_ticket_created`

| Element | Status |
|---|---|
| Event emission | 🔵 **Nothing is emitted** |
| Admin analytics | ❌ **Every figure hardcoded and contradicts other tabs** |
| Timeframe selector | ❌ Filters nothing |
| District table | 🟢 Only interactive control |

## 23. Audit logs

| Element | Status |
|---|---|
| Log view | 🟢 Renders 5 records |
| **Any admin action writes an entry** | ❌ **Never** |
| Filter / search / export | ❌ None |

🔴 With a role gate that fails open, an unwritten audit log means **no record of who did
what**.

## 24. System health

| Element | Status |
|---|---|
| 8 services listed | ❌ **None of them exists** |
| Header "System Operational" | ❌ Hardcoded green |
| Sidebar "App Backend Online" | ❌ Hardcoded — **there is no backend** |

Three permanently-green indicators, while the health tab reports SendGrid *Degraded*.

---

## 25. Master connection table

| Mobile feature | Backend | Admin location | Status |
|---|---|---|---|
| Register / Login | Users · Auth | Users | 🔵 |
| Profile | Users | Users → User Details | 🟡 local only |
| **Create Report** | Reports | Reports → All Reports | 🔵 **not saved** |
| Edit / Delete / Hide Report | Reports | Reports | 🔵 |
| Flag Post | Flags | Reports → Flagged | 🔵 memory only |
| Flag Comment | Flags | Reports → Comments | 🔵 |
| Comment | Comments | Reports → Comments | 🔵 mobile side missing |
| Nearby Requests | Reports + Geo | Analytics | 🔵 no GPS |
| Accept Help | Missions | Mission Details | 🔵 |
| Join Volunteers | Mission Volunteers | Mission Details | ❌ hardcoded names |
| Start Helping | Mission Status | Mission Details | 🔵 |
| Chat | Messages | Moderation only | 🔵 |
| Complete Mission | Mission + Media | Mission Details | 🔵 no camera |
| Impact Story | Stories | Community → Impact Stories | 🔵 |
| Share Story | Share Events | Analytics | 🔵 never counted |
| Support Ticket | Support | Platform → Support | 🔵 both ends built |
| Push Notification | Notifications | — | ❌ not installed |
| Broadcast | Broadcasts | Community → Broadcasts | 🔵 reaches nobody |
| Categories | Categories | Platform → Categories | 🔵 defined twice |
| Settings | Config | Platform → Settings | ❌ save is an alert |
| System Health | Monitoring | Platform → System Health | ❌ fabricated |
| Audit | Audit Logs | Platform → Audit Logs | ❌ never written |
| AdMob config | Monetization Config | Monetization → AdMob | 🔵 test IDs |
| Sponsors | Campaigns | Monetization → Sponsors | 🔵 keys already match |
| Analytics | Events | Analytics | 🔵 nothing emitted |

**25 features. 0 connected.**

---

## Where to start

Ranked by how much else depends on it:

| # | Build | Unblocks |
|---|---|---|
| 1 | **Backend + database + auth** | Everything |
| 2 | **`POST /reports`** | Dashboard · My Helps · Category List · admin Reports · Analytics |
| 3 | **Push token + notifications** | Alerts · broadcasts · both notification dots |
| 4 | **Media upload** | Report photos · completion proof · avatars · Impact Stories |
| 5 | **Config endpoint** | Categories · settings · sponsors · AdMob placements |

**Quickest first integration:** support tickets — both ends are already built and validated.

**Cheapest high-value fix:** sponsors — the placement keys already match; it needs one
endpoint.

---

## Related

- [API-CONTRACT](./API-CONTRACT.md) — request/response shapes and the data-model mismatches
- [IMPLEMENTATION-STATUS](./IMPLEMENTATION-STATUS.md) · [USER-JOURNEYS](./USER-JOURNEYS.md) · [PRODUCT-DECISIONS](./PRODUCT-DECISIONS.md)
