# `{{Page Name}}` — Screen Reference

> **Template.** Copy this file when documenting a new screen. Fill every section
> below — omit nothing, and write **N/A** if a section doesn't apply. Keep language
> terse, scan-friendly, fact-only. Cite code as `<file:line>`.

---

## 1. Summary

- **Route:** `{{/…}}`
- **Route file:** `<file>`
- **Primary component:** `<file>`
- **Purpose:** One sentence describing what the user does on this screen.
- **Entry points:** How users arrive (nav link / redirect / external CTA).
- **Exit points:** Where the screen sends the user next (success / cancel / error).

## 2. Layout

> What the screen is *made of*. Without this, a page doc can describe every API call and
> validation rule and still leave the reader unable to picture the screen.

- **Archetype:** `{{list}}` / `{{detail}}` / `{{create-edit}}` / `{{settings}}` / `{{dashboard}}`
- **Layout primitive:** `{{PageLayout}}` / `{{SubMenuPageLayout}}` / `{{SelectionPanelLayout}}`
- **Container width:** `{{narrow}}` — see the design system's Layout section
- **Scroll mode:** `{{Mode A — document scroll}}` / `{{Mode B — content pane scrolls alone}}`
- **Page header:** {{breadcrumb + title + subtitle + primary action}}
- **Route files:** `{{page.tsx + loading.tsx + error.tsx}}` — note any that are deliberately absent

```
{{ ┌──────────────────────────────────────────┐
   │ Breadcrumb                               │
   │ Title                        [ Action ]  │
   │ Subtitle                                 │
   ├──────────────────────────────────────────┤
   │ [ Toolbar: search · filter · view ]      │
   ├──────────────────────────────────────────┤
   │  ┌────────────┐  ┌────────────┐          │
   │  │ Card       │  │ Card       │   ← grid │
   │  └────────────┘  └────────────┘          │
   └──────────────────────────────────────────┘ }}
```

| Region | Contents | Notes |
|---|---|---|
| {{Header}} | {{title, subtitle, "New" button}} | {{collapses on scroll}} |
| {{Toolbar}} | {{search, status filter}} | {{sticky within content}} |
| {{Content}} | {{card grid, 1 col → 3 col at `lg`}} | {{the only scroller}} |

## 3. User journey

1. Step 1 — …
2. Step 2 — …
3. Step N — …

> Include screen-state branches (e.g. "form state", "loading state", "error state").

## 4. Fields (if form-bearing)

| Field | Label | Type | Required | Autocomplete | Validation | Error message |
|---|---|---|---|---|---|---|
| `{{email}}` | {{Email}} | email | ✓ | `email` | {{valid email}} | {{"Enter a valid email"}} |
| … | … | … | … | … | … | … |

Validation source of truth: `<file>`

## 5. APIs used

| # | Action | Method | Endpoint | Request | Response | Error codes |
|---|---|---|---|---|---|---|
| 1 | … | {{POST}} | `{{/api/…}}` | `{ … }` | `{ … }` | {{`VALIDATION_ERROR`, …}} |

> List every network call the screen makes, including optional or background ones.

## 6. State & side effects

- Server state / form state / global state usage.
- Storage / cookies touched.
- Toasts / analytics events emitted.

## 7. Validations & rules

- Client-side validation rules and where they mirror the backend.
- Business rules enforced on this screen.

## 8. Accessibility

- ARIA attributes used (`aria-required`, `aria-invalid`, `aria-describedby`, `role="alert"`, …).
- Focus management (auto-focus, trap, restoration).
- Keyboard flow: Tab order + shortcut keys.
- Screen-reader notes.

## 9. Responsive & theming

- Smallest tested viewport; layout breakpoints.
- Dark-mode / theme behavior.
- Safe-area / keyboard-overlap handling (if mobile).

## 10. Edge cases

- Double-submit / in-flight guard.
- Paste / autofill behavior.
- Slow / offline network handling.
- Already-authenticated / already-completed paths.
- Empty / error / rate-limited states.

## 11. Analytics

- Events fired and their properties.
- Where they're defined: `<file:line>`

## 12. Known gaps / TODOs

- Items scheduled for later.
- Open bugs with issue links.

## 13. Related docs

- Frontend: `../architecture/frontend.md`
- API: `../api/README.md`
- Design: `../design/_template.md`
