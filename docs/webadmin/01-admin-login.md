# 01 — Admin Login

> **The only gate on the admin console.** A glassmorphism sign-in card over a full-bleed
> hero image.
>
> ⚠️ **It is not a security boundary.** Credentials are hardcoded in client-side JavaScript,
> printed on the page as one-click presets, and the resulting role is carried in a URL query
> string that anyone can type.

| | |
|---|---|
| **Route** | `/admin` |
| **Source file** | `apps/web/src/app/admin/page.tsx` (231 lines) |
| **Line refs valid as of** | 2026-08-18 |
| **Component type** | Client (`'use client'`, `:1`) |
| **Navigates to** | `/admin/dashboard?role=super` or `?role=ops` |
| **Server calls** | **None** |
| **Session / token / cookie** | **None** |

---

## 1. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ♡ உதவு                                    [← Public Website] │
│   UTHAVU PLATFORM                                            │
│                                                              │
│  🌟 Admin Operations Console      ┌────────────────────────┐ │
│                                   │ Sign In to Dashboard   │ │
│  உதவி கேட்கும் குரல்,              │ Enter your operational │ │
│  அடுத்த நிமிடமே உதவுவோம்.          │ credentials…           │ │
│                                   │                        │ │
│  Tamil Nadu's #1 Community        │ ADMIN EMAIL            │ │
│  Emergency & Help Network…        │ [admin@uthavu.org    ] │ │
│  ─────────────────────────        │ PASSWORD               │ │
│  2,340+     35 min     100%       │ [••••••••            ] │ │
│  Helps      Avg        Verified   │ ☐ Remember Me  Forgot? │ │
│  Resolved   Response   Helpers    │ [ Login to Console → ] │ │
│                                   │ ── QUICK PRESET ──     │ │
│                                   │ [Super Admin][Ops Admin]│ │
│                                   └────────────────────────┘ │
│  © 2026 Uthavu Platform Inc. • Admin Command & Moderation    │
└──────────────────────────────────────────────────────────────┘
```

---

## 1A. Background image

![Uthavu community hero](../../apps/web/public/hero_community.png)

| | |
|---|---|
| **Referenced as** | `/hero_community.png` (`:41`) |
| **Actual file** | `apps/web/public/hero_community.png` |
| **Dimensions** | 1024 × 1024 |
| **File size** | **835 KB** |
| **Loaded via** | Raw `<img>` — **not** `next/image` (`:40`) |
| **Treatment** | `object-cover`, `opacity-60`, plus a slate gradient overlay (`:43–45`) |

```jsx
// :39–46
<div className="absolute inset-0 z-0">
  <img src="/hero_community.png" alt="Uthavu Community"
       className="w-full h-full object-cover opacity-60 scale-100" />
  <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/40 to-slate-950/60" />
</div>
```

**Content:** a Tamil street scene at golden hour — a young man crouching to feed a street
dog, a volunteer walking arm-in-arm with an elderly woman carrying groceries, autorickshaws
and shopfronts behind. It depicts three of the app's help categories at once — 🐶 Animal
Rescue, 👴 Elderly Support and 🍱 Food Donation.

### Where else this image is used

| Surface | File | Loader |
|---|---|---|
| Admin login background | `apps/web/src/app/admin/page.tsx:41` | raw `<img>` |
| Public landing hero | `apps/web/src/app/page.tsx:122` | ✅ `next/image` with `fill` + `priority` |
| Admin dashboard | — | ❌ Not used |

The landing page loads the same file correctly through `next/image`; the admin login does
not. It is a **square 1024×1024 image stretched full-bleed across a widescreen viewport**,
so `object-cover` crops the top and bottom heavily on desktop. See gap #10.

---

---

## 2. Interaction map — every element

| # | Element | Line | Interaction → what happens | State changed |
|---|---|---|---|---|
| 1 | **"← Public Website"** | `:66` | `next/link` to `/` — the marketing landing page | — |
| 2 | Logo / உதவு wordmark | `:53–64` | ❌ Not a link | — |
| 3 | **Admin Email** field | `:123` | `type="email"` + `required` — the browser blocks submit on an invalid address | `email` |
| 4 | **Password** field | `:137` | `type="password"` + `required` — masked | `password` |
| 5 | **"Remember Me"** checkbox | `:149` | Toggles a boolean. ❌ **`rememberMe` is never read anywhere** — there is no session to remember | `rememberMe` |
| 6 | **"Forgot Password?"** | `:157` | ❌ `alert('Demo Mode: Use quick credentials below.')` — no reset flow | — |
| 7 | **"Login to Console →"** | `:166` | Submits. Shows a **fake 600 ms** "⏳ Authenticating…" state, then matches against two hardcoded pairs. Match → hard redirect. No match → inline error | `loading`, `error` |
| 8 | **"Super Admin" preset** | `:191` | Fills the form with `admin@uthavu.org` / `Admin@123` and clears the error. **Both values are printed on the button** | `email`, `password`, `error` |
| 9 | **"Ops Admin" preset** | `:204` | Fills `ops@uthavu.org` / `Ops@123` — also printed | `email`, `password`, `error` |
| 10 | Metrics (2,340+ / 35 min / 100%) | `:87–100` | ❌ Not tappable. Hardcoded | — |
| 11 | Error banner | `:111` | ❌ Display only; appears when credentials don't match | — |

---

## 3. The authentication

```ts
// :19–34 — the complete auth implementation
const handleLogin = (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  setTimeout(() => {
    if (email === 'admin@uthavu.org' && password === 'Admin@123') {
      window.location.href = '/admin/dashboard?role=super';
    } else if (email === 'ops@uthavu.org' && password === 'Ops@123') {
      window.location.href = '/admin/dashboard?role=ops';
    } else {
      setError('Invalid email or password. Please use the demo credentials below.');
      setLoading(false);
    }
  }, 600);
};
```

| Aspect | Reality |
|---|---|
| Credential store | Two string literals in a **client component** — shipped in the browser bundle |
| Hashing | None |
| Server call | None |
| Token / cookie / session | **None** |
| "Authenticating…" spinner | A `setTimeout(600)` — nothing happens during it |
| Role transport | `?role=super` / `?role=ops` in the **URL query string** |
| Redirect method | `window.location.href` — a full page load, bypassing the Next.js router |

### 3.1 Accounts

| Role | Email | Password | Lands on |
|---|---|---|---|
| Super Admin | `admin@uthavu.org` | `Admin@123` | `/admin/dashboard?role=super` |
| Ops Admin | `ops@uthavu.org` | `Ops@123` | `/admin/dashboard?role=ops` |

Both pairs are rendered as visible text inside the preset buttons (`:200–201`, `:213–214`)
under the heading **"Quick Preset Credentials"**.

---

## 4. 🔴 Security assessment

This login provides **no access control whatsoever**. Four independent bypasses:

| # | Bypass | How |
|---|---|---|
| 1 | **Skip login entirely** | Navigate straight to `/admin/dashboard`. The dashboard has no auth guard — it reads `?role` and renders |
| 2 | **Self-grant Super Admin** | Append `?role=super`. The gate is `isSuperAdmin = roleParam !== 'ops'` (`dashboard/page.tsx:542`), so **anything except the literal `ops` is Super Admin** — including no param at all |
| 3 | **Read the credentials from the page** | They're printed on the preset buttons in plain text |
| 4 | **Read them from the bundle** | `'use client'` means the comparison ships to the browser; View Source or any bundle inspection reveals both pairs |

Consequences:

- Every visitor to `/admin/dashboard` is a Super Admin by default.
- The Ops role is the *only* restricted state, and it is opt-in via a URL you control.
- Logging out (`dashboard/page.tsx:909`) is a `<Link href="/admin">` — it navigates back to
  this page and clears nothing, because there is nothing to clear.

**None of this is exploitable against real data today** — the dashboard is entirely mock
data with no API. It becomes critical the moment a backend is attached.

**Minimum fix:** move authentication server-side (Next.js middleware or a route handler),
issue an httpOnly session cookie, derive the role from that cookie rather than the URL, and
guard `/admin/*` in middleware.

---

## 5. Branding & copy

| Element | Value |
|---|---|
| Logo | **Inline SVG** (`:54–59`) — a 4-path heart-handshake, emerald `#059669` container |
| Wordmark | **உதவு** + "UTHAVU PLATFORM" |
| Headline | உதவி கேட்கும் குரல், / **அடுத்த நிமிடமே உதவுவோம்.** (Tamil, `:79–80`) |
| Subhead | "Tamil Nadu's #1 Community Emergency & Help Network…" |
| Badge | 🌟 Admin Operations Console |
| Footer | © 2026 Uthavu Platform Inc. • Admin Command & Moderation Console |

### 5.1 The logo differs from the mobile app

| | Mobile | Admin login |
|---|---|---|
| Source | `HeartHandshake` from `lucide-react-native` 1.27.0 | **Hand-inlined SVG**, 4 `<path>` elements (`:54–59`) |
| Paths | 1 | 4 |
| Stroke width | `1.5` (splash) / `2` (login) | `2.2` |

`lucide-react` **is** a dependency of `apps/web` (`package.json`), so the identical mark is
available as `<HeartHandshake />`. The inline SVG appears to be an older lucide revision —
the two render differently. See gap #7.

### 5.2 Copy inconsistencies

- **"Tamil Nadu's #1"** (`:83`) — the same unsubstantiated superlative used in the mobile
  app's share text ([mobile 22 gap #7](../mobile/22-invite-friends-screen.md#6-gaps--known-issues)).
- The three metrics (2,340+ / 35 min / 100%) are hardcoded here, on the landing page, and in
  the mobile app — **the same invented numbers in three places**.

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Hardcoded credentials in a client component** (`:25`, `:27`). | Both admin passwords ship in the browser bundle. | Server-side auth. |
| 2 | **Credentials printed on the page** (`:200`, `:213`). | Anyone who loads `/admin` has working admin credentials. | Remove before any real deployment. |
| 3 | **Role passed in the URL** (`:26`, `:28`) and read as `roleParam !== 'ops'`. | `?role=super` is self-grantable; **no param also means Super Admin**. | Derive the role from a signed session. |
| 4 | **No auth guard on the dashboard.** | `/admin/dashboard` renders without ever visiting this page. | Guard `/admin/*` in middleware. |
| 5 | **No session, token or cookie.** | Nothing to expire, revoke or audit. Logout clears nothing. | Issue an httpOnly session cookie. |
| 6 | **"Remember Me" is dead** (`:9`, `:151`). | A checkbox that does nothing. | Wire to session duration, or remove. |
| 7 | **Logo is a hand-inlined SVG** rather than `lucide-react`'s `HeartHandshake`, which is already a dependency. | The admin brand mark visibly differs from the mobile app's. | Import the component. |
| 8 | **"Forgot Password?" is an alert** (`:159`). | No recovery path. | Implement, or hide. |
| 9 | **Fake 600 ms spinner** (`:24`). | Simulates latency that doesn't exist and will need replacing anyway. | Tie to the real request. |
| 10 | **Hero image via raw `<img>`** (`:40`) — bypasses `next/image`, despite the landing page (`page.tsx:122`) loading the same file correctly with `fill` + `priority`. 835 KB, and a **square 1024×1024 asset stretched full-bleed across a widescreen viewport**, so `object-cover` crops it heavily. | No optimisation, resizing, format negotiation or lazy-loading on the page's largest asset. | Use `next/image`; export a wide crop for desktop. |
| 11 | **`window.location.href` instead of the router.** | Full page reload; discards client state. | `router.push()`. |
| 12 | **Metrics duplicated across three surfaces** with no source. | Numbers drift independently. | Single source. |

---

## 6A. Mobile ↔ Admin connection

**None — and the two authentication models have nothing in common.**

| | 📱 Mobile login | 🖥️ Admin login |
|---|---|---|
| Identifier | **Phone number** → OTP | **Email + password** |
| Credential check | 6-digit OTP compared **client-side** | Email/password matched against a **hardcoded array** (`:19–34`) |
| Credentials visible? | OTP is displayed to the user | ⚠️ **Printed in the UI as preset buttons** (`:191`) |
| Token issued | ❌ None | ❌ None |
| Session stored | `AsyncStorage` — profile only, no auth | ❌ Nothing |
| Role | No roles | `?role=super` \| `?role=ops` **in the URL** |
| Server call | ❌ None | ❌ None — a 600 ms `setTimeout` |

**Neither product authenticates anything.** They fail in different ways: mobile accepts any
OTP it just showed you; admin ships its own credentials on the page.

### 6A.1 There is no shared identity

A person who is a user in the app and an administrator has **two unrelated identities** —
mobile keys on phone, admin on email. Nothing links them:

- Admin cannot see which app account an admin action belongs to
- The mobile app has no concept of staff, so an admin browsing the app is an ordinary user
- `MOCK_ADMINS` (`:159`) and mobile's `UserContext` share **no field** except a display name

### 6A.2 What a real integration needs

| Endpoint | Purpose |
|---|---|
| `POST /auth/admin/login` | Email + password → **signed token**, replacing the hardcoded array |
| `GET /auth/me` | Role and permissions **from the token**, not from `?role=` |
| `POST /auth/refresh` | Session lifetime |
| `POST /auth/logout` | Invalidate server-side |

The role must arrive **inside the token**. As built, a user types `?role=super` and is a
super-admin — see [02 §4](./02-dashboard-shell.md).

---

## 7. What works well

- **Native HTML validation** — `type="email"` + `required` and `type="password"` + `required`
  (`:123`, `:137`) mean the browser blocks an empty or malformed submit before any JS runs.
  Ironically this is **stronger input validation than any screen in the mobile app**
  ([mobile 25 §2.1](../mobile/25-forms-validation-and-cross-cutting.md#21-validation-exists-in-exactly-four-places)).
- **The error state is real** — a specific message rendered in a styled banner, cleared on
  the next attempt and when a preset is used.
- **`loading` disables the submit button** (`:168`), preventing double submission.
- **Tamil-first headline** — the only place in either product where Tamil copy leads.

---

## 8. QA checklist

- [ ] Submitting an empty form is blocked by the browser, not by JS.
- [ ] An invalid email format is rejected by the browser.
- [ ] Wrong credentials show the inline error and re-enable the button.
- [ ] "Super Admin" preset fills both fields and clears any error.
- [ ] Correct credentials show "⏳ Authenticating…" for ~600 ms, then redirect.
- [ ] The URL after login contains `?role=super` or `?role=ops`.
- [ ] **Navigate directly to `/admin/dashboard`** — confirm it loads as Super Admin (gap #4).
- [ ] Change `?role=ops` to `?role=super` in the address bar — confirm privileges change (gap #3).
- [ ] "Remember Me" has no observable effect (gap #6).
- [ ] "Forgot Password?" shows an alert.
- [ ] "← Public Website" returns to `/`.
- [ ] Tamil headline renders without tofu boxes.

---

## 9. Changing this page

| To change… | Edit |
|---|---|
| Credentials | `:25`, `:27` |
| Preset buttons | `:191–215` |
| Post-login destination | `:26`, `:28` |
| Fake delay | `:24` — the `600` literal |
| Metrics | `:87–100` |
| Headline / subhead | `:78–84` |
| Logo SVG | `:54–59` |

---

**Next:** [02 — Dashboard shell](./02-dashboard-shell.md)
