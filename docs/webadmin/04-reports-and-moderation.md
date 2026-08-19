# 04 — Reports & moderation

> The Reports sidebar group: **All Reports**, **Flagged Reports** and **Comments**. This is
> the receiving end of everything the mobile app flags — and nothing arrives.

| | |
|---|---|
| **Tabs** | `reports` `:1545` · `flagged` `:2074` · `comments` `:2210` |
| **Source** | `apps/web/src/app/admin/dashboard/page.tsx` |
| **Line refs valid as of** | 2026-08-18 |
| **Sidebar badge** | `openReports + pendingFakes + pendingFlags` |
| **Data** | `MOCK_REPORTS` `:73` (8) · `MOCK_FAKE_REPORTS` `:84` (3) · `MOCK_FLAGS` `:90` (5) · `MOCK_COMMENTS` `:115` (5) |

---

## 0. Layout

### 0.1 Help Requests — list (`:1545`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Help Requests                                                            │
│ All community help requests                                              │
│ ┌────────────────────────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│ │ 🔍 Search title or reporter│ │ Category▾│ │ Status ▾ │ │ Urgency  ▾ │ │
│ └────────────────────────────┘ └──────────┘ └──────────┘ └────────────┘ │
├──────────────────────────────────────────────────────────────────────────┤
│ Image  Title      Category  Reporter  Priority  Location  Status  Actions │
│ ─────────────────────────────────────────────────────────────────────── │
│ [img]  Wedding    🍱 Food    Ravi      CRITICAL  T.Nagar   Open   [View  │
│        Hall…               Shankar                                Details]│
│ …                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Columns at `:1934`; the row's **[View Details]** button at `:1947` opens the detail panel.

### 0.2 Report detail panel (`:1616–1932`) — 8 sections

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ‹ Wedding Hall Excess Food Donation                       [ CRITICAL ]   │
├──────────────────────────────────────────────────────────────────────────┤
│ 1  📄 Complete Request Description & Special Notes              :1672    │
│ ───────────────────────────────────────────────────────────────────────  │
│ 2  Photos     [img][Zoom] [img][Zoom] [img][Zoom]         :1694–1706    │
│ ───────────────────────────────────────────────────────────────────────  │
│ 3  🤝 Lead Volunteer & Mission Team                             :1736    │
│ ───────────────────────────────────────────────────────────────────────  │
│ 4  💬 Moderated Public Comments              [Hide] [Delete]    :1819    │
│ ───────────────────────────────────────────────────────────────────────  │
│ 5  📣 Volunteer Field Updates                                   :1839    │
│ ───────────────────────────────────────────────────────────────────────  │
│ 6  🔒 Private Admin Notes                                       :1894    │
│    ┌────────────────────────────────────────────────────────────┐        │
│    │ Write private internal moderation note...                  │        │
│    └────────────────────────────────────────────────────────────┘        │
│ ───────────────────────────────────────────────────────────────────────  │
│ 7  🔗 Nearby Related Requests                                   :1903    │
│ ───────────────────────────────────────────────────────────────────────  │
│ 8  📋 Report Audit History                                      :1913    │
└──────────────────────────────────────────────────────────────────────────┘
```

**The deepest single view in either product.** Sections 4 and 5 are the admin-side mirrors of
the mobile [Community Updates feed](../mobile/14-request-details-screen.md#1d-community-updates--the-full-flow)
and the public-comments thread.

### 0.3 Flagged Reports (`:2074`) — two stacked queues

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🚩 Flagged Reports & Content Moderation                                  │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Reports Flagged as Fake or Scam (3)                          :2083   │ │
│ │  card · card · card                                                  │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Community Flags Table (5)                                    :2137   │ │
│ │ Flag Type│Content│Type│Flagged User│Related Request│Time│Actions      │ │
│ │  …                                        [Dismiss] [Remove]         │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 0.4 Public Comments (`:2210`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 💬 Public Comments Moderation                                            │
├──────────────────────────────────────────────────────────────────────────┤
│ Comment Text │ User │ Report │ Time │ Likes │ Flags │ Status │ Actions   │
│  …                                                            [Delete]   │
└──────────────────────────────────────────────────────────────────────────┘
```

Columns at `:2221`. This tab moderates **public comments on active requests** — the surface
[Decision 2](../PRODUCT-DECISIONS.md#decision-2--community-comments-public--mission-chat-private)
confirms is wanted, and which the mobile app has **not built**.

---

## 1. All Reports (`:1545`)

### 1.1 Filtering — works

```ts
// :784–788
const filteredReports = reports.filter(r => {
  const statusOk = reportFilter === 'All' || r.status === reportFilter;
  const searchOk  = !reportSearch
    || r.title.toLowerCase().includes(reportSearch.toLowerCase())
    || r.reporter.toLowerCase().includes(reportSearch.toLowerCase());
  return statusOk && searchOk;
});
```

Status chips **and** free-text search on title or reporter, combined. Both live.

### 1.2 Interaction map — list

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 1 | **Status filter chip** | `:1556` | Filters by report status | ✅ |
| 2 | Search box | `:1568` | Live filter on title **or** reporter | ✅ |
| 3 | **Report row** | `:1947` | Opens the detail panel | ✅ |

### 1.3 Interaction map — detail panel

| # | Element | Line | Interaction → what happens | Real? |
|---|---|---|---|---|
| 4 | ✕ close | `:1578` | Closes the panel | ✅ |
| 5 | **Mark Open** | `:1584` | `updateReportStatus(id, 'Open')` — updates the list **and** the open panel | ✅ |
| 6 | **Mark Fake** | `:1587` | Sets status `Fake` | ✅ |
| 7 | **Mark Cancelled** | `:1590` | Sets status `Cancelled` | ✅ |
| 8 | **⭐ Generate Impact Story** | `:1594` | ❌ **Nothing happens.** Calls `setCreatingStoryFor(report)` — but the state is declared as `const [, setCreatingStoryFor] = useState(…)` (`:628`), **the value slot is discarded**, so nothing can ever read it and no composer exists. Only rendered when `status === 'Completed' && !isImpactStory` | ❌ |
| 9 | **Call reporter** | `:1654` | ❌ `alert('Calling reporter at {phone}')` — no `tel:` link | ❌ |
| 10 | **Issue warning** | `:1657` | ❌ `alert('Warning issued to {reporter}')` — **no warning is recorded**, and `MOCK_USERS` has a `warnings` counter it never touches | ❌ |
| 11 | **Evidence photos ×3** | `:1694`, `:1700`, `:1706` | ❌ `alert('Opening full resolution photo')` — no lightbox | ❌ |
| 12 | **Open location in Maps** | `:1719` | ✅ `window.open('https://maps.google.com/?q={location}', '_blank')` — a real map link | ✅ |
| 13 | Hide comment | `:1829` | `hideComment(id)` — toggles `hidden` | ✅ |
| 14 | Delete comment | `:1830` | `deleteComment(id)` — removes it | ✅ |
| 15 | **Mark as fake** (bottom) | `:1887` | Duplicate of #6 | ✅ |
| 16 | **Save private note** | `:1896` | ❌ `alert('Private note saved')` — the textarea has a `defaultValue` and is **uncontrolled**; the text is discarded | ❌ |
| 17 | **Merge duplicate** | `:1907` | ❌ `alert('Merged duplicate report!')` | ❌ |

**Six of the seventeen actions are `alert()` stubs**, and a seventh (#8) does nothing at
all. Notably #10 and #16 — issuing a warning and saving a moderation note are the two
actions an operator would most expect to persist.

> **#8 is a silent no-op, not a stub.** `:628` reads
> `const [, setCreatingStoryFor] = useState<…>(null)` — the value is destructured into an
> empty slot, so it is unreadable by construction. `setCreatingStoryFor` is called in
> exactly two places: this button (`:1594`) and the reset inside `nav()` (`:722`). Nothing
> renders. The button gives no feedback whatsoever — not even an alert.

### 1.4 The detail panel — full section map

The report detail is a two-column layout with **14 numbered sections**. The source numbers
them 1–9, 11–14 and 17 — **10, 15 and 16 are missing**, suggesting sections were removed
without renumbering.

#### Left column — the report itself

| § | Line | Section | Content |
|---|---|---|---|
| 1 | `:1606` | Report header & summary | Title, status, priority, category |
| 2 | `:1633` | **Reporter details card** | Name, phone, profession; hosts *Call reporter* (#9) and *Issue warning* (#10) |
| 3 | `:1670` | 📄 Complete Request Description & Requirements | Full description text |
| 4 | `:1684` | 🖼️ **Uploaded Evidence Media (Before Help)** | Labelled *"3 Photos Uploaded"* (`:1688`); the three photo buttons (#11) live here |
| 5 | `:1712` | 📍 Location & Google Map Directions | Address + the working Maps link (#12) |
| 6 | `:1734` | 🤝 Lead Volunteer & Mission Team | Roster for the report |
| 7 | `:1758` | ⏱ **Mobile App Product Lifecycle Flow** | A step timeline of the mission — see §1.5 |
| 8 | `:1817` | 💬 Moderated Public Comments | Comment rows with hide/delete (#13, #14) |
| 9 | `:1837` | 📣 **Volunteer Field Updates** | ⚠️ Header comment reads *"COMMUNITY UPDATES MODERATION"* but the block is **read-only** — it maps `updates` to text rows with **no hide, delete or pin action** |

#### Right column — the action panel

| § | Line | Section | Content |
|---|---|---|---|
| — | `:1860` | Status / resolution actions | Emerald header; hosts the status buttons |
| 12 | `:1858` | 🤖 **AI Safety Verification** | Displays an AI verification **score** for the report |
| 11 | `:1880` | 🚨 Fake Report Investigation & Flags | Red header; hosts the second *Mark as fake* (#15) |
| 13 | `:1892` | 🔒 Private Admin Notes | Uncontrolled textarea + Save (#16) |
| 14 | `:1901` | 🔗 Nearby Related Requests | Hosts *Merge duplicate* (#17) |
| 17 | `:1911` | 📋 **Report Audit History** | Per-report audit trail — **static; nothing appends to it** |

### 1.5 Two surfaces describe a verification pipeline that doesn't exist

Sections 4, 7 and 12 present a proof-and-verification story the mobile app cannot produce:

| Section | Claims | Mobile reality |
|---|---|---|
| §4 Uploaded Evidence Media | "3 Photos Uploaded" | Mobile cannot attach a real photo — [Report Flow](../mobile/10-report-flow-screen.md) has no `onPress` on Take Photo/Upload, and [Request Details](../mobile/14-request-details-screen.md) sets a hardcoded Unsplash URL |
| §7 Mobile App Product Lifecycle Flow | A staged mission timeline | Mobile lifecycle transitions are local `useState`, never transmitted |
| §12 AI Safety Verification | A verification **score** | Mobile's "AWS moderation" greps caption text for `'unsafe'`/`'nudity'` — [mobile 14 §3](../mobile/14-request-details-screen.md#3-the-simulated-ai-moderation-scan) |

Both ends display a moderation pipeline; neither performs one.

### 1.6 `updateReportStatus` — correctly dual-updating

```ts
// :727
const updateReportStatus = (id: number, status: string) => {
  setReports(p => p.map(r => r.id === id ? { ...r, status } : r));
  if (selectedReport?.id === id) setSelectedReport(p => p ? { ...p, status } : null);
};
```

Updates both the list and the open detail panel, so the badge, the row and the panel stay
in sync. A common bug avoided deliberately.

---

## 2. Flagged Reports (`:2074`)

Two queues in one tab.

### 2.1 Fake / scam queue — `MOCK_FAKE_REPORTS` (`:84`, 3 records)

Fields: `reason · reportedBy · flagCount`.

| # | Action | Line | What happens | Real? |
|---|---|---|---|---|
| 1 | **Dismiss** | `:2112` | Removes it from the queue | ✅ |
| 2 | **Warn reporter** | `:2116` | ❌ Alerts, then removes from the queue — **the warning isn't recorded** | ⚠️ Partial |
| 3 | **Confirm fake** | `:2120` | ✅ Sets the underlying report's status to `Fake` **and** clears the queue entry — the best-wired action in the tab | ✅ |
| 4 | **Suspend user** | `:2124` | ❌ `alert('User {reporter} suspended.')` then removes the entry — **the user's status is never changed** | ❌ |

⚠️ #4 is the sharpest problem here: the operator sees "User suspended", the queue entry
disappears, and the user remains **Active** in the Users tab. The action appears to have
worked and did not.

### 2.2 Content flags — `MOCK_FLAGS` (`:90`, 5 records)

Reasons: **Spam · Wrong Category · Duplicate · Abuse · False Information**.

| # | Action | Line | What happens | Real? |
|---|---|---|---|---|
| 5 | **Dismiss flag** | `:2155`, `:2196` | `dismissFlag(id)` — removes from state | ✅ |
| 6 | **Remove content + warn** | `:2156` | ❌ Alerts, then dismisses the flag — the content is **not** removed | ❌ |

---

## 3. Comments (`:2210`)

`MOCK_COMMENTS` (`:115`, 5 records) including spam samples, each with a `flagCount`.

| # | Action | Line | What happens | Real? |
|---|---|---|---|---|
| 1 | **Hide / Unhide** | `:2237` | `hideComment(id)` — toggles the `hidden` flag | ✅ |
| 2 | **Delete** | `:2238` | `deleteComment(id)` — removes it | ✅ |

Two actions, both real. The simplest and most honest tab in the console.

---

## 4. 🔴 Mobile ↔ Admin connection

**Nothing arrives from the app.** This is the most consequential disconnect in the product.

| Mobile action | Where | Should reach | Actually reaches |
|---|---|---|---|
| Report Post to Admin (7 reasons) | [14 §2](../mobile/14-request-details-screen.md#2-reporting-fake--spam-content) | Flagged Reports | ❌ In-memory context, wiped on reload |
| Quick 🚩 on a list card | [13](../mobile/13-category-list-screen.md) `:635` | Flagged Reports | ❌ Same, and the reason is lost |
| "Report this update" | [14](../mobile/14-request-details-screen.md) `:682` | Comments / Updates | ❌ An `Alert` only — nothing recorded |
| Publishing a report | [10 Report Flow](../mobile/10-report-flow-screen.md) | All Reports | ❌ **The report is never saved anywhere** |

### 4.1 The app promises this tab by name

`RequestDetailsScreen.js:53` tells the user:

> *"Thank you for keeping Udhavu safe. **Uthavu Admins will review this report in the
> Flagged Reports queue.**"*

That queue is this tab. It contains 5 hardcoded records and has never received anything.

### 4.2 Reason vocabularies don't match

| Mobile (7) | Admin (5) |
|---|---|
| Fake / Misleading | False Information |
| Wrong Location | Wrong Category |
| Spam | Spam ✅ |
| Inappropriate Content | Abuse |
| Duplicate | Duplicate ✅ |
| Already Resolved | — |
| Other | — |

Only **Spam** and **Duplicate** align. A mapping layer — ideally in `libs/shared`, which is
currently dead — would be needed before wiring.

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **"User suspended" doesn't suspend** (`:2124`). The queue entry vanishes and the user stays Active. | The operator believes an account was actioned. **The most misleading action in the console.** | Call `toggleUserStatus`, or add a real suspend. |
| 2 | **"Issue warning" records nothing** (`:1657`, `:2116`), though `MOCK_USERS` has a `warnings` counter. | Warnings can never accumulate toward the suspension thresholds the settings define. | Increment `warnings` on the user. |
| 3 | **"Remove content and warn" removes nothing** (`:2156`) — it only dismisses the flag. | Flagged content stays live while the flag disappears. Worse than doing nothing. | Delete or hide the content. |
| 4 | **The private moderation note is discarded** (`:1895`, `:1896`). The textarea is uncontrolled with a `defaultValue`; "Save" alerts. | Internal moderation context is lost. | Control the field and persist. |
| 5 | **Nothing arrives from the app.** | Every record is seeded mock data; the app's flags never leave the device. | `POST /flags` from mobile; read here. |
| 6 | **Reason vocabularies differ** (7 vs 5, only 2 shared). | Blocks a clean integration. | Agree one enum in `libs/shared`. |
| 7 | **Evidence photos aren't viewable** (`:1694–1706`) — three alerts. | Moderators judge fake reports without seeing the evidence. | Add a lightbox. |
| 8 | **"Call reporter" is an alert** (`:1654`). | No contact path from a report. | `tel:` link, as the mobile app does. |
| 9 | **"Merge duplicate" is an alert** (`:1907`) though "Duplicate" is a first-class flag reason. | The queue can flag duplicates and never resolve them. | Implement, or remove. |
| 10 | **Two "Mark as fake" buttons** (`:1587`, `:1887`) in one panel. | Redundant. | Keep one. |
| 11 | **All changes are lost on refresh.** | An hour of moderation disappears. | Persist. |
| 12 | **"⭐ Generate Impact Story" is a silent no-op** (`:1594`). The state it writes is declared `const [, setCreatingStoryFor] = useState(…)` (`:628`) — value discarded, no composer rendered. | The only path from a completed report to a published story does nothing, with **no feedback at all** — not even an alert. Meanwhile the Impact Stories tab's own "New Impact Story" button is itself an alert stub ([05](./05-community.md)). **There is no way to create an impact story in the console.** | Restore the value slot and build the composer, or remove the button. |
| 13 | **§9 is labelled moderation but has no actions** (`:1837`). The source comment says *"COMMUNITY UPDATES MODERATION"*; the block renders `updates` as read-only text with no hide, delete or pin — while the standalone [Community Updates tab](./05-community.md#2-community-updates-2253) *does* offer delete. | An operator reviewing a report can read field updates but not act on them, and must leave the report to moderate one. | Add the same delete action here, or drop the "moderation" label. |
| 14 | **§17 Report Audit History is static** (`:1911`). Actions taken in this very panel — status changes, comment deletion, flag confirmation — append nothing. | The per-report audit trail is decorative, same as the platform-wide [Audit Logs](./07-platform-settings.md#5-audit-logs-3217--read-only). | Append on every mutation. |
| 15 | **§12 AI Safety Verification displays a score** (`:1858`) for a check that never ran. | Presents machine-verification confidence on evidence the app cannot capture. | Wire real moderation, or remove the section. |
| 16 | **Section numbering skips 10, 15 and 16.** | Sections were removed without renumbering — a maintenance smell in a 400-line panel. | Renumber. |

> **Fix order:** #1 first — it reports a safety action that didn't happen. Then #3, then #2.

---

## 6. What works well

- **`updateReportStatus` updates list and panel together** (`:727`) — no stale detail view.
- **"Confirm fake"** (`:2120`) is properly wired: it sets the report's status *and* clears
  the queue entry, in one action.
- **Combined status + search filtering** (`:784–788`) — both apply together, unlike the
  mobile Category List where two radius controls disagree.
- **Comments tab is entirely real** — hide and delete both work, with no stubs.
- **Google Maps link is genuine** (`:1719`) — `window.open` with the report location.
- **Sidebar badges track this tab live**, so resolving a report visibly decrements the count.

---

## 7. QA checklist

- [ ] Status chips filter the list; search narrows further; both combine.
- [ ] Opening a report shows the detail panel with evidence and comments.
- [ ] "Mark Fake" updates the row, the panel and the sidebar badge together.
- [ ] Mark a report `Completed`, then click "⭐ Generate Impact Story" — **nothing happens** (gap #12).
- [ ] Call reporter / Issue warning / photos / private note / merge — all alerts only (gaps #2, #4, #7, #8, #9).
- [ ] Flagged → **"Suspend user"**: the entry disappears; then check the Users tab — **the user is still Active** (gap #1).
- [ ] Flagged → "Confirm fake": the underlying report's status becomes `Fake`.
- [ ] Flagged → "Remove content and warn": the flag clears but the content remains (gap #3).
- [ ] Comments → hide toggles; delete removes.
- [ ] Refresh the page — every change is gone (gap #11).

---

## 8. Changing these tabs

| To change… | Edit |
|---|---|
| Report data | `:73` — `MOCK_REPORTS` |
| Fake queue | `:84` — `MOCK_FAKE_REPORTS` |
| Flag reasons | `:90` — `MOCK_FLAGS` |
| Comments | `:115` — `MOCK_COMMENTS` |
| Filter logic | `:784–788` |
| Status mutation | `:727` |
| Flag dismissal | `:733` — `dismissFlag` |
| Comment actions | `:731`, `:732` |

---

**Previous:** [03 — Dashboard & Users](./03-dashboard-and-users.md) · **Next:** [05 — Community](./05-community.md)
