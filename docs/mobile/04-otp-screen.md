# 04 — OTP Verification Screen

> **Screen 4 of the mobile app.** Six single-digit boxes with auto-advance, plus a 30-second
> resend countdown. Currently accepts **any** six digits.

| | |
|---|---|
| **Route name** | `Otp` |
| **Source file** | `apps/mobile/src/screens/OtpScreen.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/App.js:51–55` |
| **Entry animation** | `slide_from_right` |
| **Arrives from** | `Login` (via `navigate` — Login stays in the stack) |
| **Navigates to** | `Permissions` (via `navigate`) |
| **Can go back** | ✅ Yes — back arrow → `navigation.goBack()` → Login |
| **Network calls** | None |
| **Talks to admin web** | No |

---

## 1. Layout

```
┌──────────────────────────────┐
│  ←                           │  back arrow — plain "←" glyph, 24 dp
│                              │
│  Verify number               │  28 / bold
│  Enter the 6-digit code sent │  15 / secondary
│  to +91 98765 43210.         │  ⚠ HARDCODED — see gap #1
│                              │
│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐    │  6 boxes · 45 × 56 · space-between
│  └──┘└──┘└──┘└──┘└──┘└──┘    │
│                              │
│     Resend code in 00:30     │  centred; becomes a green link at 00:00
│                              │
│         ⋮ (spacer)           │  marginTop: 'auto'
│  ┌────────────────────────┐  │
│  │        Verify          │  │  grey until all 6 filled
│  └────────────────────────┘  │
└──────────────────────────────┘
```

No images and no icons — this screen is entirely text and inputs. Even the back arrow is
a `←` character in a `<Text>` (`OtpScreen.js:41`), **not** a lucide icon like the rest of
the app. See gap #7.

---

## ⚡ Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | **Back arrow `←`** | `:40` | Returns to Login with the phone number still filled in. Tap target is the bare glyph — no padding, well under 44 dp | — | `goBack()` → `Login` |
| 2 | OTP box ×6 — typing a digit | `:49` | Writes the digit and **auto-focuses the next box** (boxes 1–5). The 6th does not advance | `otp[i]` | — |
| 3 | OTP box — typing a letter/symbol | `:21` | ❌ Rejected before state changes — the box doesn't flicker | — | — |
| 4 | OTP box — **backspace** | — | Clears that box but ❌ **does not move focus backwards.** You must tap the previous box by hand | `otp[i]` → `''` | — |
| 5 | Countdown text "Resend code in 00:29" | `:63` | ❌ Not tappable while the timer is running | — | — |
| 6 | **"Resend Code"** (only at 00:00) | `:65` | Restarts the countdown at 30. ❌ **No code is sent** — no network call exists | `timer` → 30 | — |
| 7 | **"Verify"** — fewer than 6 digits | `:70` | ❌ Nothing. Grey and `disabled` | — | — |
| 8 | **"Verify"** — all 6 filled | `:70` | Advances. ❌ **The code is never checked — `000000` works** | — | `Permissions` (navigate) |
| 9 | Android hardware back | — | Pops to Login (same as #1) | — | `Login` |

> Note the `onPress` on #6 is attached to a `<Text>`, not a button, so its tap area is
> exactly the text glyphs.

---

## 1A. OTP validation — requirement vs. implementation

Full trace: **Input → Validation → Business logic → API → Success → Error → Navigation.**

### 1A.1 Field specification

| Property | Value | Line |
|---|---|---|
| Field | 6 single-digit boxes | `:49` |
| Required | Yes — all six | `:31` |
| Input type | `keyboardType="number-pad"`, `maxLength={1}` each | `:53–54` |
| Default value | `['', '', '', '', '', '']` | `:6` |
| Autofill | ❌ No `textContentType="oneTimeCode"` / `autoComplete="sms-otp"` | — |
| Error message | ❌ **None exists** | — |
| Submit | `verifyOtp()` — gated on `isComplete` | `:33`, `:72` |

### 1A.2 Rule-by-rule conformance

| # | Rule | Status | Actual behaviour |
|---|---|---|---|
| 1 | OTP contains 6 digits | ✅ **Implemented** | Six boxes, `maxLength={1}` each |
| 2 | Only numeric accepted | ✅ **Implemented** | `if (/[^0-9]/.test(value)) return;` (`:21`) — rejected before state changes |
| 3 | Cannot continue with an incomplete OTP | ✅ **Implemented** | `isComplete = otp.every(d => d !== '')` gates `disabled` (`:31`, `:72`) |
| 4 | **OTP must match the code generated for that number** | ❌ **Not Implemented** | `verifyOtp()` is `navigation.navigate('Permissions')` — nothing is compared. **`000000` passes** |
| 5 | **OTP has an expiry time** | ❌ **Not Implemented** | The 30 s timer is a **resend cooldown only**. No code exists, so none can expire |
| 6 | **Show "Invalid OTP. Please try again."** | ❌ **Not Implemented** | No error state, no message, no attempt counter |
| 7 | **Show "OTP expired. Please request a new OTP."** | ❌ **Not Implemented** | No expiry concept |
| 8 | Resend after a cooldown | ⚠️ **Partially Implemented** | The 30 s countdown and the link work (`:63–65`), but tapping it only calls `setTimer(30)` — **no code is sent** |
| 9 | Navigate on success | ⚠️ **Partial** | Navigates — but unconditionally, since there is no success/failure distinction |

**3 of 9 rules implemented. The four that define OTP as a security mechanism — matching,
expiry, and both error messages — do not exist.**

### 1A.3 Test cases — actual results

| Input | Expected | **Actual** |
|---|---|---|
| Correct 6-digit code | ✅ Proceed | ✅ Proceeds |
| `000000` (wrong code) | ❌ "Invalid OTP. Please try again." | ❌ **Proceeds** |
| `123456` (any 6 digits) | ❌ Rejected unless it matches | ❌ **Proceeds** |
| `12345` (5 digits) | ❌ Blocked | ✅ Verify stays grey and `disabled` |
| Letter typed into a box | ❌ Rejected | ✅ Box doesn't change |
| Code entered after expiry | ❌ "OTP expired…" | ❌ **Proceeds** — no expiry exists |
| Resend tapped at 00:00 | New code sent | ⚠️ Timer resets to 30; **nothing sent** |
| Backspace to correct a digit | Focus moves back | ⚠️ Clears the box but **focus stays put** |

### 1A.4 The flow as specified vs. as built

```
SPECIFIED                              ACTUAL
Enter OTP                              Enter OTP
    ↓                                      ↓
6-digit validation                     6-digit validation  ✅
    ↓                                      ↓
Verify against generated code          ❌ no comparison
    ↓                                      ↓
┌────────────┐                         (single path)
│            │                              ↓
Valid    Invalid                         Permissions
  ↓          ↓                          — always
Next    Error message
```

| Stage | Specified | Implemented |
|---|---|---|
| **Input** | 6 numeric digits | ✅ |
| **Validation** | Format **and** correctness **and** freshness | ⚠️ Format only |
| **Business logic** | Match → proceed · mismatch → error · expired → error | ❌ Always proceeds |
| **API** | `POST /auth/otp/verify { phone, code }` | ❌ **No call** — see [API-CONTRACT](../API-CONTRACT.md#authentication) |
| **Success** | Session token stored, then navigate | ⚠️ Navigates; **no token, no session** |
| **Error** | Two distinct messages + attempts remaining | ❌ None |
| **Navigation** | `push` to Permissions on success only | ⚠️ Unconditional |

### 1A.5 Minimum fix

```js
const [error, setError] = useState('');
const [verifying, setVerifying] = useState(false);

const verifyOtp = async () => {
  setVerifying(true); setError('');
  try {
    const { token } = await verifyCode(route.params.phone, otp.join(''));
    await saveSession(token);
    navigation.navigate('Permissions');
  } catch (e) {
    setError(e.code === 'EXPIRED'
      ? 'OTP expired. Please request a new OTP.'
      : 'Invalid OTP. Please try again.');
    setOtp(['','','','','','']);          // clear for retry
    inputRefs.current[0]?.focus();
  } finally { setVerifying(false); }
};
```

Server-side this needs: code generation tied to the phone number, a TTL (typically 5 min),
an attempt limit, and rate limiting on both request and verify. **Expiry must be enforced
by the server** — a client-side timer can be bypassed.

Also required for the flow to work at all: [03 — Login](./03-login-screen.md#1a-mobile-number-validation--requirement-vs-implementation)
must pass `{ phone }` as a param. Today it doesn't, which is why `:45` hardcodes
*"+91 98765 43210"* in the subtitle.

---

## 2. Visual specification

From `OtpScreen.js:83–109`. This file uses a condensed one-line style per rule, unlike
the other screens.

| Element | Spec | Token |
|---|---|---|
| Screen bg | `#FFFFFF` | `COLORS.bgWhite` |
| Content padding | `24` | `SIZES.padding` |
| Back arrow | `←` · `24` · `#111827` · `marginBottom: 24` | `COLORS.textPrimary` |
| Title | `28` / bold / `#111827` / `marginBottom: 8` | `COLORS.textPrimary` |
| Subtitle | `15` / `#6B7280` / `marginBottom: 32` | `COLORS.textSecondary` |
| Timer text | centred / `#6B7280` | `COLORS.textSecondary` |
| Timer digits | `#111827` / weight `600` | `COLORS.textPrimary` |
| Resend link | `#16A34A` / weight `600` | `COLORS.primaryGreen` |

### 2.1 OTP boxes

Row with `justifyContent: 'space-between'`, `marginBottom: 32`.

| Property | Value |
|---|---|
| Width × height | `45` × `56` |
| Background | `#F8FAFC` (`COLORS.bgGrey`) |
| Border | `1` solid `#E5E7EB` (`COLORS.borderColor`) |
| Radius | `12` — **not** a `SIZES` token (`radiusSm` is 8, `radiusMd` is 16) |
| Font size | `24`, centred |
| `maxLength` | `1` |
| Keyboard | `number-pad` |

> No focus state is styled. The box being typed into looks identical to the other five.
> See gap #6.

### 2.2 Verify button

Identical treatment to Login's Continue button, including the same hardcoded disabled grey.

| State | Background | Condition |
|---|---|---|
| Enabled | `#16A34A` | all six digits non-empty |
| Disabled | `#9CA3AF` (hardcoded) | any box empty |

---

## 3. Functionality

### 3.1 State

```js
const [otp, setOtp]     = useState(['', '', '', '', '', '']);  // one slot per box
const [timer, setTimer] = useState(30);                        // resend countdown
const inputRefs         = useRef([]);                          // for auto-advance focus
```

### 3.2 Digit entry and auto-advance

```js
// OtpScreen.js:20–29
const handleChange = (index, value) => {
  if (/[^0-9]/.test(value)) return;        // reject non-digits outright
  const newOtp = [...otp];
  newOtp[index] = value;
  setOtp(newOtp);

  if (value !== '' && index < 5) {
    inputRefs.current[index + 1].focus();  // jump to the next box
  }
};
```

- Non-digits are rejected before state is touched — the box simply doesn't change.
- After a digit is entered in boxes 1–5, focus moves forward automatically.
- Focus does **not** move backwards on delete. See gap #3.

### 3.3 Resend countdown

```js
// OtpScreen.js:10–18
useEffect(() => {
  let interval = null;
  if (timer > 0) {
    interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
  }
  return () => clearInterval(interval);
}, [timer]);
```

Because `timer` is in the dependency array, the effect tears down and re-creates the
interval **every second**. It doesn't leak (the cleanup runs each time) and the countdown
is correct, but it is one `setInterval` created and destroyed per tick. See gap #4.

At `0`, the text swaps to a green **Resend Code** link whose only action is
`setTimer(30)` — it restarts the clock and sends nothing.

### 3.4 Completion & submit

```js
const isComplete = otp.every(digit => digit !== '');

const verifyOtp = () => {
  navigation.navigate('Permissions');
};
```

`isComplete` gates the button. `verifyOtp` performs **no verification** — it navigates.
Any six digits pass. See gap #2.

### 3.5 Navigation

```
Login ──navigate──▶ Otp ──navigate──▶ Permissions ──replace──▶ ProfileSetup
  ▲                  │
  └─── goBack() ─────┘
       (back arrow, OtpScreen.js:40)
```

Note the asymmetry: `Login → Otp → Permissions` all use `navigate` (screens stay in the
stack, back works), but `Permissions → ProfileSetup` uses `replace`, which severs the
chain. From Profile Setup you cannot get back to the OTP screen.

---

## 4. Mobile ↔ Admin web connection

**None.** No code is sent, none is checked.

**Where the connection belongs:** this is the moment a user account becomes real. A
verified OTP should create the record that appears in the admin console's *Users* table
(`apps/web/src/app/admin/dashboard/page.tsx`), populating `phone`, `joined`, `lastLogin`,
`device` and `status`. Those rows are hardcoded mock data today.

Expected shape once wired:

```
POST /auth/otp/verify { phone, code }
  → 200 { token, user }   → store token, navigate to Permissions
  → 400 { error }         → show inline error, keep the user here
```

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **The phone number in the subtitle is hardcoded.** `OtpScreen.js:45` literally reads `Enter the 6-digit code sent to +91 98765 43210.` — and Login never passes the real number (see [03 gap #1](./03-login-screen.md#6-gaps--known-issues)). | Every user is shown a stranger's number on the verification screen. Most visible bug in the flow. | Pass `{ phone }` from Login, read `route.params.phone`, and render it formatted. |
| 2 | **No verification.** `verifyOtp` navigates unconditionally. | `000000` works. There is no authentication. | Call the verify endpoint; navigate only on success. |
| 3 | **Backspace doesn't move focus back.** `handleChange` only advances. Clearing a box leaves the cursor there. | Correcting a typo mid-code is awkward — the user must tap the previous box manually. | Add `onKeyPress`: if the key is `Backspace` and the box is empty, focus `index - 1`. |
| 4 | **The resend interval is re-created every second** because `useEffect` depends on `[timer]`. | Works, but churns a timer per tick — an anti-pattern that will bite if the effect grows. | Depend on `[]` and use the functional updater with a `clearInterval` when it hits 0. |
| 5 | **Resend sends nothing.** The link only calls `setTimer(30)`. | The user believes a new code was sent. | Call the resend endpoint, then reset the timer on success. |
| 6 | **No focus styling on the boxes.** | The active box is indistinguishable from the rest. | Track focus in state and apply a green border to the active box. |
| 7 | **Back arrow is a text glyph, not an icon.** `<Text>←</Text>` while every other screen uses lucide. | Renders differently per platform/font; inconsistent with the app's icon set. | Use `<ChevronLeft />` from `lucide-react-native`. |
| 8 | **Tiny back-button hit area.** `styles.backButton` has no padding — the tap target is just the glyph, well under the 44 dp minimum. | Hard to hit. | Add `padding: 8` and `hitSlop`. |
| 9 | **No auto-submit.** Even with all six digits entered, the user must still tap Verify. | An extra tap versus every other OTP screen users know. | Fire `verifyOtp()` from `handleChange` when the last digit lands. |
| 10 | **No SMS autofill.** Missing `textContentType="oneTimeCode"` (iOS) / `autoComplete="sms-otp"` (Android). | The OS can't offer the code from the notification. | Add both props to each box. |
| 11 | **Possible crash on `.focus()`.** `inputRefs.current[index + 1].focus()` doesn't null-check. | If a ref hasn't attached, this throws. Unlikely but unguarded. | `inputRefs.current[index + 1]?.focus()`. |
| 12 | **`12` radius and `#9CA3AF` are hardcoded.** Neither is in `theme.js`. | Drift; `#9CA3AF` is duplicated from `LoginScreen.js`. | Add `COLORS.disabled` and a `radiusInput` size token. |
| 13 | **No error/loading state.** | Nowhere to show "Invalid code" once the API is real. | Add `error` and `isVerifying` state. |

---

## 5A. What works well

- **The countdown interval is cleaned up** (`:17`) — `return () => clearInterval(interval)`.
- **Each box is a single-character input** (`:53–54`) — `keyboardType="number-pad"` plus
  `maxLength={1}` gives correct auto-advance behaviour with no manual string slicing.
- **Verify is disabled until all six digits are present** (`:72`), and the disabled state is
  bound to the same `isComplete` value that greys it.
- **Back returns to Login** rather than replacing it, so a mistyped number can be corrected
  without restarting the flow.

---

## 6. QA checklist

- [ ] The number shown in the subtitle matches what was typed on Login (blocked by gap #1).
- [ ] Typing a digit advances focus to the next box; the 6th does not advance.
- [ ] Letters and symbols are rejected.
- [ ] Verify is grey until all six boxes are filled, then green.
- [ ] Countdown runs 00:30 → 00:00 exactly once per second.
- [ ] At 00:00 the text becomes a tappable green "Resend Code" and resets to 00:30.
- [ ] Back arrow returns to Login with the phone number still filled in.
- [ ] Six boxes at 45 dp wide fit without overflow on a 320 dp-wide device.
- [ ] Backgrounding the app mid-countdown and returning doesn't produce a negative timer.

---

## 7. Changing this screen

| To change… | Edit |
|---|---|
| Number of digits | `OtpScreen.js:6` (array length) **and** `:26` (the `index < 5` bound) |
| Countdown length | `OtpScreen.js:7` and `:65` — both use `30` |
| Subtitle / hardcoded number | `OtpScreen.js:45` |
| Where Verify goes | `OtpScreen.js:34` |
| Box size / style | `styles.otpInput` (`:91–101`) |

---

**Previous:** [03 — Login](./03-login-screen.md) · **Next:** [05 — Permissions](./05-permissions-screen.md)
