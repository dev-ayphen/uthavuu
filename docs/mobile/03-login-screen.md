# 03 — Login Screen

> **Screen 3 of the mobile app.** Phone-number entry. One field, one button. This is the
> single entry point for both sign-in and sign-up — there is no separate register flow.

| | |
|---|---|
| **Route name** | `Login` |
| **Source file** | `apps/mobile/src/screens/LoginScreen.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/App.js:46–50` |
| **Entry animation** | `slide_from_right` |
| **Arrives from** | `Onboarding` (via `replace`) |
| **Navigates to** | `Otp` (via `navigate` — Login **stays** in the stack) |
| **Network calls** | None — no OTP is actually sent |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌──────────────────────────────┐
│        ♡ உதவு                │  header — logo 28 + wordmark, centred
│                              │
│  ┌────────────────────────┐  │
│  │      hero image        │  │  login_hero.png · 180 dp tall · contain
│  └────────────────────────┘  │
│                              │
│  Welcome back                │  28 / bold
│  Enter your phone number…    │  15 / secondary
│                              │
│  ┌─────┐ ┌────────────────┐  │
│  │ +91 │ │ Phone number   │  │  fixed prefix + input
│  └─────┘ └────────────────┘  │
│                              │
│         ⋮ (spacer)           │  marginTop: 'auto'
│  By continuing, you agree…   │  12 / centred
│  ┌────────────────────────┐  │
│  │       Continue         │  │  green when valid, grey when not
│  └────────────────────────┘  │
└──────────────────────────────┘
```

---

## ⚡ Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | Logo + உதவு wordmark | `:17–18` | ❌ Nothing — plain icon and text | — | — |
| 2 | Hero image | `:21` | ❌ Nothing | — | — |
| 3 | **`+91` prefix** | `:27` | ❌ **Nothing — it is a static `<View>`, not a country picker.** It also isn't part of the stored value | — | — |
| 4 | Phone input | `:30` | Accepts digits only; strips non-digits and caps at 10 on every keystroke | `phone` | — |
| 5 | **"Terms" link** | `:42` | ❌ **Nothing.** Coloured green and bold to look tappable, but it has no `onPress` | — | — |
| 6 | **"Privacy Policy" link** | `:42` | ❌ **Nothing** — same as #5 | — | — |
| 7 | **"Continue"** — fewer than 10 digits | `:44` | ❌ Nothing. Grey `#9CA3AF` and `disabled={true}`, so the press doesn't register | — | — |
| 8 | **"Continue"** — 10 digits entered | `:44` | Goes to OTP verification. **No OTP is sent, and the phone number is not passed along** | — | `Otp` (navigate) |
| 9 | Android hardware back | — | Nothing to pop — Onboarding used `replace`, so Login is the stack root | — | — |

> #5 and #6 matter beyond polish: the screen states "By continuing, you agree to our Terms
> and Privacy Policy" while providing no way to read either.

---

## 1A. Mobile number validation — requirement vs. implementation

Full trace: **Input → Validation → Business logic → API → Success → Error → Navigation.**

### 1A.1 Field specification

| Property | Value | Line |
|---|---|---|
| Field | Mobile number | `:30` |
| Required | Yes (implicitly — Continue is gated on it) | `:11` |
| Input type | `keyboardType="phone-pad"` | `:33` |
| Country code | `+91`, **fixed** — a static `<View>`, not a picker | `:27` |
| Stored value | Digits only — **the `+91` is NOT part of it** | `:35` |
| `maxLength` | `10` | `:36` |
| Default value | `''` | `:9` |
| Error message | ❌ **None exists** — the button simply stays grey | — |

### 1A.2 Rule-by-rule conformance

| # | Rule | Status | Actual behaviour |
|---|---|---|---|
| 1 | Country code fixed as +91 | ✅ **Implemented** | Static text (`:27`). ⚠️ Not concatenated into `phone`, so the stored value has no country code |
| 2 | Exactly 10 digits | ✅ **Implemented** | `maxLength={10}` + `.substring(0, 10)` cap the input; `phone.length >= 10` gates the button. Together this means exactly 10 |
| 3 | Only numeric characters | ✅ **Implemented** | `text.replace(/[^0-9]/g, '')` strips non-digits on every keystroke (`:35`) |
| 4 | **Must start with 6–9** (Indian mobile prefix) | ❌ **Not Implemented** | No prefix check exists anywhere. `isValid` is length-only |
| 5 | Continue disabled while invalid | ⚠️ **Partial** | `disabled={!isValid}` works (`:46`) — but "invalid" means *short*, never *malformed* |
| 6 | Show a validation error | ❌ **Not Implemented** | No error text, no red border, no helper message. The only feedback is a grey button |

### 1A.3 Test cases — actual results

| Input | Expected | **Actual** | Why |
|---|---|---|---|
| `9876543210` | ✅ Valid | ✅ Continue enables | 10 digits |
| `987654321` (9) | ❌ Rejected | ✅ Continue stays grey | `length >= 10` fails |
| `98765432101` (11) | ❌ Rejected | ⚠️ **Silently truncated to `9876543210` → accepted** | `maxLength` blocks typing the 11th; a **paste** is cut by `.substring(0, 10)`, keeping the first 10 |
| `5123456789` | ❌ Rejected — invalid prefix | ❌ **ACCEPTED** | Rule #4 does not exist. `0000000000` is also accepted |
| `98AB567890` | ❌ Rejected | ⚠️ **Silently becomes `98567890`** (8 digits) → Continue stays grey | Letters are stripped mid-typing, so the user sees their input mangled with no explanation |

> Two of the five cases fail: an invalid prefix is accepted outright, and two inputs are
> **silently altered** rather than rejected. In both silent cases the user is given no
> indication that what they typed was changed.

### 1A.4 The flow as specified vs. as built

```
SPECIFIED                          ACTUAL
+91 9876543210                     +91 9876543210
      ↓                                  ↓
Validate (10 digits, 6–9 start)     Validate (length only)
      ↓                                  ↓
Send OTP  ──────────────────────►   ❌ NOTHING — no API call
      ↓                                  ↓
OTP Screen                          OTP Screen (phone not passed)
```

| Stage | Specified | Implemented |
|---|---|---|
| **Input** | 10-digit numeric, +91 fixed | ✅ |
| **Validation** | Length + numeric + prefix 6–9 | ⚠️ Length + numeric only |
| **Business logic** | Block invalid, enable on valid | ⚠️ Blocks short only |
| **API** | `POST /auth/otp/request { phone }` | ❌ **No call** — see [API-CONTRACT](../API-CONTRACT.md#authentication) |
| **Success** | OTP dispatched → OTP screen | ⚠️ Navigates; **no OTP sent** |
| **Error** | Inline validation message | ❌ None |
| **Navigation** | `push` to OTP with the phone number | ⚠️ `navigate('Otp')` — **no params** |

### 1A.5 Minimum fix

```js
// replace :11
const isValid = /^[6-9]\d{9}$/.test(phone);

// replace :47
onPress={async () => {
  try {
    await requestOtp(phone);                       // POST /auth/otp/request
    navigation.navigate('Otp', { phone });         // pass it on
  } catch (e) { setError(e.message); }             // surface the failure
}}
```

Add an `error` state rendered beneath the field. The regex `/^[6-9]\d{9}$/` enforces rules
2, 3 and 4 in one expression.

---

## 2. Brand assets on this screen

### 2.1 Logo — same component as the splash, smaller and green

```jsx
// LoginScreen.js:17
<HeartHandshake size={28} color={COLORS.primaryGreen} />
```

| | Splash (`01`) | Login (this screen) |
|---|---|---|
| Component | `HeartHandshake` | `HeartHandshake` (same) |
| Size | `80` | `28` |
| Colour | `#FFFFFF` | `#16A34A` |
| Stroke width | `1.5` | **default `2`** — not overridden here |

> ⚠️ The stroke weight is inconsistent between the two screens. The splash deliberately
> thins it to `1.5`; Login uses lucide's default `2`. See gap #6.

### 2.2 Hero image

![Login hero](../../apps/mobile/src/assets/login_hero.png)

| | |
|---|---|
| **Path** | `apps/mobile/src/assets/login_hero.png` |
| **Loaded** | `require('../assets/login_hero.png')` — `LoginScreen.js:6` |
| **Dimensions** | 1024 × 1024 · 688 KB |
| **Displayed** | `width: '100%'`, `height: 180`, `resizeMode="contain"`, `borderRadius: 16` |
| **Content** | Line illustration — a couple helping an elderly woman across a crossing, a boy feeding a street dog, a woman with grocery bags, neighbours in a green street |

> Note: `resizeMode="contain"` on a square source inside a `100% × 180` box means the
> image is letterboxed — it renders about 180 dp wide and centred, leaving empty white
> space on both sides. The `borderRadius: 16` is applied to the box, not the visible art,
> so it has no visible effect. See gap #5.

---

## 3. Visual specification

From `LoginScreen.js:57–150`.

| Element | Spec | Token |
|---|---|---|
| Screen bg | `#FFFFFF` | `COLORS.bgWhite` |
| Content padding | `24` | `SIZES.padding` |
| Header | row, centred, `marginTop: 20`, `marginBottom: 40` | — |
| Wordmark `உதவு` | `20` / bold / `#16A34A` / `marginLeft: 8` | `COLORS.primaryGreen` |
| Title "Welcome back" | `28` / bold / `#111827` / `marginBottom: 8` | `COLORS.textPrimary` |
| Subtitle | `15` / `#6B7280` / `marginBottom: 32` | `COLORS.textSecondary` |
| Terms text | `12` / centred / `#6B7280` / `marginBottom: 16` | `COLORS.textSecondary` |
| Terms links | `#16A34A` / weight `600` | `COLORS.primaryGreen` |

### 3.1 Phone input group

Row with `gap: 12`. Both parts share the same visual treatment:

| Property | Value | Token |
|---|---|---|
| Background | `#F8FAFC` | `COLORS.bgGrey` |
| Border | `1` solid `#E5E7EB` | `COLORS.borderColor` |
| Radius | `24` | `SIZES.radiusLg` |
| Padding | `16` | — |
| Font size | `16` | — |
| Text colour | `#111827` | `COLORS.textPrimary` |

- **`+91` prefix** — a static `<View>`/`<Text>`, weight `500`. Not a picker, not editable.
- **Input** — `flex: 1`, `placeholder="Phone number"`, `keyboardType="phone-pad"`, `maxLength={10}`.

### 3.2 Continue button — two states

| State | Background | Condition |
|---|---|---|
| Enabled | `#16A34A` (`COLORS.primaryGreen`) | `phone.length >= 10` |
| Disabled | `#9CA3AF` — **hardcoded**, not a theme token | `phone.length < 10` |

Both states: `borderRadius: 24`, `padding: 16`, label `#FFFFFF` 16/600. `disabled={!isValid}`
also blocks the press, so the grey state is genuinely inert.

---

## 4. Functionality

### 4.1 State & validation

```js
const [phone, setPhone] = useState('');
const isValid = phone.length >= 10;
```

### 4.2 Input sanitisation

```js
// LoginScreen.js:35
onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, '').substring(0, 10))}
```

Two guards, applied on every keystroke:
1. `replace(/[^0-9]/g, '')` — strips anything that isn't a digit, so pasted text like
   `+91 98765-43210` reduces to digits only.
2. `.substring(0, 10)` — hard cap at 10 digits (belt and braces with `maxLength={10}`).

Combined with `isValid`, the field is effectively **exactly 10 digits** — `>= 10` can never
exceed 10.

### 4.3 Submit

```js
// LoginScreen.js:47
onPress={() => navigation.navigate('Otp')}
```

That is the entire submit path. **No OTP is requested, no backend is contacted, and the
phone number is not passed to the next screen.** See gap #1.

### 4.4 Navigation

```
Onboarding ──replace──▶ Login ──navigate──▶ Otp
                          ▲                  │
                          └──── goBack() ────┘
```

Unlike the previous two screens, Login uses `navigate`, not `replace`. Login stays mounted
in the stack, which is what makes the OTP screen's back arrow work
(`OtpScreen.js:40` → `navigation.goBack()`).

---

## 5. Mobile ↔ Admin web connection

**None today.** This is the screen where that connection *should* exist. For reference,
the admin console has its own separate, unrelated login at
`apps/web/src/app/admin/page.tsx` — admins do not authenticate through this screen and
mobile users do not authenticate through that one.

**When a backend is added, this screen becomes the integration point:**

| Step | Expected call | Consumed by admin |
|---|---|---|
| Tap Continue | `POST /auth/otp/request { phone }` | — |
| Enter OTP (screen 04) | `POST /auth/otp/verify { phone, code }` → session token | — |
| First successful verify | creates the user record | Admin *Users* table (`apps/web/src/app/admin/dashboard/page.tsx`) — the `phone`, `joined`, `lastLogin`, `device`, `status` columns are exactly this data, currently mocked |

The admin dashboard's user rows already have the shape this flow would produce
(`phone: '9876543210'`, `lastLogin: '2 hours ago'`, `status: 'Active' | 'Suspended' | 'Blocked'`)
— they're hardcoded arrays today.

---

## 6. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **The phone number is never passed to the OTP screen.** `navigation.navigate('Otp')` sends no params, and `OtpScreen.js:45` hardcodes the subtitle *"Enter the 6-digit code sent to **+91 98765 43210**"*. | Whatever number the user types, the next screen shows a fake one. Anyone entering their own number sees a stranger's. This is the most visible bug in the auth flow. | `navigation.navigate('Otp', { phone })`, then read it via `route.params` and format it. |
| 2 | **No authentication at all.** No OTP request, no backend, no session token, no persisted auth state. | The whole flow is a UI prototype. Anyone can walk into the app. | Wire to a real auth provider; store the session token. |
| 3 | **`+91` is hardcoded.** Not a country picker, and it isn't concatenated into `phone` either. | India-only, and the stored value has no country code. | Store E.164 (`+91XXXXXXXXXX`) even if the picker stays fixed for now. |
| 4 | **Validation is length-only.** `phone.length >= 10` accepts `0000000000`. | Invalid numbers reach the (future) OTP send. | Validate the Indian mobile pattern `/^[6-9]\d{9}$/`. |
| 5 | **Hero image is letterboxed.** A 1024² source with `resizeMode="contain"` in a `100% × 180` box renders ~180 dp wide with white space each side; `borderRadius: 16` has no visible effect. | Looks like a small floating square, not a hero. | Export a wide (e.g. 3:2) asset, or use `cover` with `overflow: 'hidden'`. |
| 6 | **Logo stroke weight differs from the splash** — `2` here vs `1.5` there. | Subtle brand inconsistency between the first two screens a user sees. | Add `strokeWidth={1.5}`, or better, wrap the mark in a shared `<BrandMark />` component. |
| 7 | **Terms and Privacy links are dead.** `styles.linkText` colours them green but there is no `onPress`. | They look tappable and do nothing — a compliance problem, not just a UI one. | Wrap each in a `<Text onPress={…}>` that opens the policy. |
| 8 | **Disabled colour `#9CA3AF` is hardcoded.** Not in `theme.js`. Duplicated identically in `OtpScreen.js:107`. | Drift. | Add `COLORS.disabled = '#9CA3AF'`. |
| 9 | **No keyboard avoidance.** No `KeyboardAvoidingView`. | On short screens the keyboard can cover the Continue button, which sits at `marginTop: 'auto'`. | Wrap the content in `KeyboardAvoidingView` (`behavior="padding"` on iOS). |
| 10 | **No loading or error state.** No spinner, no "couldn't send code" path. | Nowhere to surface a real network failure once the API lands. | Add `isLoading` / `error` state alongside `phone`. |
| 11 | **"Welcome back" is shown to new users too.** This screen handles both sign-in and sign-up. | Slightly wrong for a first-time user. | Neutral copy, e.g. "Enter your number to continue". |

---

## 6A. What works well

- **The phone input is properly constrained** (`:33–36`) — `keyboardType="phone-pad"` and
  `maxLength={10}` together make an invalid length nearly impossible to type. Most screens in
  this app validate after the fact; this one prevents the bad input.
- **Continue is genuinely disabled** (`:46`) — `disabled={!isValid}` is bound to the same
  condition that greys it, so the button never lies about being tappable.
- **The `+91` prefix is fixed, not typed** — removes an entire class of formatting error.
- **The hero image is a real asset** — [`login_hero.png`](../../apps/mobile/src/assets/login_hero.png),
  linked rather than inlined.

---

## 7. QA checklist

- [ ] Typing letters or symbols produces nothing in the field.
- [ ] Pasting `+91 98765-43210` results in exactly `9876543210`.
- [ ] The field stops accepting input at 10 digits.
- [ ] Continue is grey and unpressable at 0–9 digits; green and pressable at 10.
- [ ] The keyboard opens as a phone pad, not a full QWERTY.
- [ ] The number entered here appears on the OTP screen (blocked by gap #1).
- [ ] Back from the OTP screen returns here with the number still filled in.
- [ ] Continue is reachable with the keyboard open on a small device (gap #9).
- [ ] Tamil wordmark `உதவு` renders without tofu boxes next to the green logo.

---

## 8. Changing this screen

| To change… | Edit |
|---|---|
| Minimum digits | `LoginScreen.js:11` — `isValid` |
| Sanitisation rule | `LoginScreen.js:35` |
| Country code | `LoginScreen.js:28` — the `+91` text |
| Where Continue goes | `LoginScreen.js:47` |
| Hero image | Replace `apps/mobile/src/assets/login_hero.png`, or change the `require` on line 6 |
| Titles / subtitle / terms copy | `LoginScreen.js:23–24`, `:41–43` |
| Disabled button colour | `styles.disabledButton` (`:142–144`) |

---

**Previous:** [02 — Onboarding](./02-onboarding-screen.md) · **Next:** [04 — OTP Verification](./04-otp-screen.md)
