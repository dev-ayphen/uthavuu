# 02 — Onboarding Screen

> **Screen 2 of the mobile app.** A 3-slide carousel explaining what Uthavu is, shown
> immediately after the splash. Ends at Login.

| | |
|---|---|
| **Route name** | `Onboarding` |
| **Source file** | `apps/mobile/src/screens/OnboardingScreen.js` |
| **Line refs valid as of** | 2026-08-18 |
| **Registered in** | `apps/mobile/App.js:41–45` |
| **Entry animation** | `fade` |
| **Arrives from** | `Splash` (via `replace`) |
| **Navigates to** | `Login` (via `replace`) |
| **Slides** | 3 |
| **Network calls** | None |
| **Talks to admin web** | No |

---

## 1. Slide content

All three slides are a hardcoded array at `OnboardingScreen.js:9–28`. Copy is **English only**
— there is no i18n layer.

### Slide 1

![Onboarding slide 1](../../apps/mobile/src/assets/onboarding_1.png)

| | |
|---|---|
| **Image** | `apps/mobile/src/assets/onboarding_1.png` |
| **Title** | See Something That Needs Help? |
| **Description** | If you see an injured animal, someone in need, excess food, or a roadside emergency, report it in less than 30 seconds. |

### Slide 2

![Onboarding slide 2](../../apps/mobile/src/assets/onboarding_2.png)

| | |
|---|---|
| **Image** | `apps/mobile/src/assets/onboarding_2.png` |
| **Title** | Nearby Volunteers Respond |
| **Description** | Your report is shared only with nearby people who are willing to help, making responses fast and relevant. |

### Slide 3

![Onboarding slide 3](../../apps/mobile/src/assets/onboarding_3.png)

| | |
|---|---|
| **Image** | `apps/mobile/src/assets/onboarding_3.png` |
| **Title** | Every Small Act Matters |
| **Description** | Together we can build safer streets, reduce waste, rescue animals, and support one another through everyday acts of kindness. |

### 1.1 How the images are loaded

Static `require()` at the top of the file — bundled into the app, not fetched:

```js
// OnboardingScreen.js:5–7
const onboarding1Img = require('../assets/onboarding_1.png');
const onboarding2Img = require('../assets/onboarding_2.png');
const onboarding3Img = require('../assets/onboarding_3.png');
```

| Asset | Dimensions | File size |
|---|---|---|
| `onboarding_1.png` | 1024 × 1024 | 595 KB |
| `onboarding_2.png` | 1024 × 1024 | 810 KB |
| `onboarding_3.png` | 1024 × 1024 | 750 KB |
| | | **≈ 2.1 MB total** |

---

## ⚡ Interaction map — every tap target

| # | Element | Line | Tap → what happens | State changed | Navigates |
|---|---|---|---|---|---|
| 1 | Hero image | `:50` | ❌ Nothing — a plain `<Image>`, not wrapped in a touchable | — | — |
| 2 | Title / description | `:58–59` | ❌ Nothing | — | — |
| 3 | Pagination dots | `:62` | ❌ **Nothing — they are plain `<View>`s.** You cannot tap a dot to jump to that slide | — | — |
| 4 | **Primary button** — "Next" (slides 1–2) | `:74` | Advances one slide | `currentSlide` +1 | — |
| 5 | **Primary button** — "Get Started" (slide 3) | `:74` | Leaves onboarding for good | — | `Login` (**replace**) |
| 6 | **Secondary** — "Skip" (slide 1 only) | `:79` | Jumps straight past all slides | — | `Login` (**replace**) |
| 7 | **Secondary** — "Back" (slides 2–3) | `:79` | Steps back one slide | `currentSlide` −1 | — |
| 8 | Swipe left / right | — | ❌ **Nothing.** No `FlatList`, `ScrollView` or `PanResponder` — the carousel cannot be swiped, only buttoned | — | — |
| 9 | Android hardware back | — | ❌ Unhandled — **exits the app** rather than stepping back a slide | — | — |

**Label logic** — one button, three meanings:

```jsx
// :76 — primary
{currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}
// :84 — secondary
{currentSlide === 0 ? 'Skip' : 'Back'}
```

So there is **no way to skip from slides 2 or 3** — the secondary button has become "Back".

---

## 2. Visual specification

From the `StyleSheet` at `OnboardingScreen.js:93–168`.

### 2.1 Layout — two stacked sections

```
┌──────────────────────────────┐
│                              │  topSection
│      hero image (cover)      │  flex: 1.2
│                              │  bg #F8FAFC
│                              │  bottom corners rounded 36
╰──────────────────────────────╯  overflow: hidden
│      Title (22, bold)        │
│  Description (14, secondary) │  bottomSection
│                              │  flex: 1
│         ● ▬ ●   dots         │  padding 24
│                              │  alignItems center
│  ┌────────────────────────┐  │
│  │  Next / Get Started    │  │  primary, green
│  └────────────────────────┘  │
│       Skip / Back            │  secondary, text-only
└──────────────────────────────┘
```

| Element | Spec | Token |
|---|---|---|
| Screen bg | `#FFFFFF` | `COLORS.bgWhite` |
| `topSection` | `flex: 1.2`, bg `#F8FAFC`, `borderBottomLeftRadius: 36`, `borderBottomRightRadius: 36`, `overflow: 'hidden'` | `COLORS.bgGrey` |
| `heroImage` | `width: '100%'`, `height: '100%'`, `resizeMode="cover"` | — |
| `bottomSection` | `flex: 1`, `padding: 24`, centred | `SIZES.padding` |
| Title | `22` / bold / `#111827` / centred / `marginTop: 10`, `marginBottom: 10` | `COLORS.textPrimary` |
| Description | `14` / `#6B7280` / centred / `lineHeight: 20` | `COLORS.textSecondary` |

### 2.2 Pagination dots

| State | Width | Height | Radius | Colour |
|---|---|---|---|---|
| Inactive | `8` | `8` | `4` | `#E5E7EB` (`COLORS.borderColor`) |
| **Active** | `24` | `8` | `4` | `#16A34A` (`COLORS.primaryGreen`) |

Row with `gap: 8`, `marginTop: 20`. The active dot stretches into a pill — width only,
height stays 8.

### 2.3 Buttons

Container is pinned to the bottom with `marginTop: 'auto'`, `width: '100%'`, `gap: 8`.

| Button | Style |
|---|---|
| **Primary** | bg `#16A34A` · `borderRadius: 24` (`SIZES.radiusLg`) · `padding: 16` · text `#FFFFFF` 16/600 |
| **Secondary** | no background · `padding: 12` · text `#6B7280` 15/600 |

---

## 3. Functionality

### 3.1 State

One piece of local state — no context, no storage:

```js
const [currentSlide, setCurrentSlide] = useState(0);   // 0 | 1 | 2
```

### 3.2 Button labels are position-dependent

| `currentSlide` | Primary label | Primary action | Secondary label | Secondary action |
|---|---|---|---|---|
| `0` | **Next** | → slide 1 | **Skip** | `replace('Login')` |
| `1` | **Next** | → slide 2 | **Back** | → slide 0 |
| `2` | **Get Started** | `replace('Login')` | **Back** | → slide 1 |

```js
// OnboardingScreen.js:33–39
const nextSlide = () => {
  if (currentSlide < slides.length - 1) setCurrentSlide(prev => prev + 1);
  else navigation.replace('Login');
};
```

```jsx
// OnboardingScreen.js:79–82 — the secondary button does double duty
onPress={() => {
  if (currentSlide === 0) navigation.replace('Login');   // "Skip"
  else prevSlide();                                       // "Back"
}}
```

### 3.3 Navigation

```
Splash ──replace──▶ Onboarding ──replace──▶ Login
                    slide 0 ⇄ 1 ⇄ 2
                    (local state only — no route change)
```

Moving between slides is **not** navigation — it's a `useState` change, so the three
slides share one route entry. Leaving uses `replace`, so Onboarding is removed from the
stack and the back button on Login cannot return here.

---

## 4. Mobile ↔ Admin web connection

**None.** No network call, no analytics, no remote config. Slide copy is compiled into the
bundle, so changing onboarding text requires an app release — the admin console cannot
edit it.

---

## 5. Gaps & known issues

| # | Issue | Impact | Fix |
|---|---|---|---|
| 1 | **Illustrations have text baked into the pixels.** `onboarding_2.png` contains the heading *"HELP IS ON THE WAY!"*, a subtitle, **and its own row of 4 pagination dots**. `onboarding_3.png` contains *"BUILDING COMMUNITY, SAVING LIVES"* **and its own orange "GET STARTED" button**. | The image shows a second set of dots and a second Get Started button directly above the real ones — two competing CTAs on one screen. The in-image dot count (4) doesn't even match the real slide count (3). | Re-export the illustrations with **no text and no UI chrome**. All copy must come from the `slides` array so the real components own it. |
| 2 | **Garbled text in `onboarding_1.png`.** The notice board renders scrambled non-words ("Unlaveadoo trrans, aoldoons afernitiotes…"). | Looks unfinished/broken up close. | Regenerate or clean the illustration. |
| 3 | **Baked-in text can't be translated.** The app's name is Tamil (`உதவு`) and the audience is Tamil-speaking, but the headings are English pixels. | Localisation is impossible without re-exporting art. | Same fix as #1 — text belongs in code. |
| 4 | **Square images in a non-square frame.** 1024×1024 assets are drawn with `resizeMode="cover"` into a `flex: 1.2` region, which is much wider than tall on most phones. | Heavy centre-crop. On slide 2 and 3 the baked-in headings sit at the very top of the image and **will be cropped off** on many screen sizes — unpredictably. | Export art at the frame's aspect ratio, or switch to `resizeMode="contain"`. |
| 5 | **No swipe gesture.** Slides advance only via the Next/Back buttons — there is no `FlatList`, `ScrollView` or `PanResponder`. | Every user's first instinct on a dotted carousel is to swipe; nothing happens. Feels broken. | Use a horizontal paged `FlatList` and drive `currentSlide` from `onMomentumScrollEnd`. |
| 6 | **Android hardware back is unhandled.** No `BackHandler`. | On slides 1 and 2, the OS back button exits the app instead of stepping back a slide. | Add a `BackHandler` listener that calls `prevSlide()` while `currentSlide > 0`. |
| 7 | **Skip disappears after slide 0.** From slide 1 onward the secondary button becomes "Back", so there is no way to skip. | A returning user must tap through to the end. | Keep a persistent Skip (e.g. top-right) on every slide. |
| 8 | **Onboarding is unconditional.** No "has seen onboarding" flag is written or read. | Every cold start replays all 3 slides forever. Pairs with [gap #2 in the splash doc](./01-splash-screen.md#7-gaps--known-issues). | Persist `@uthavu_onboarding_seen` and have `Splash` skip straight past. |
| 9 | **~2.1 MB of PNGs in the bundle.** Three full-size 1024² PNGs. | Larger download, slower cold start. | Resize to the real display size and convert to WebP. |
| 10 | **No accessibility labels.** `<Image>` has no `accessibilityLabel`, buttons have no `accessibilityRole`. | Screen readers announce nothing meaningful. | Add `accessible`, `accessibilityLabel`, `accessibilityRole="button"`. |

> **Priority:** #1 and #4 are the visible ones — a duplicated "GET STARTED" button and a
> second row of dots are obvious to any user on first launch.

---

## 5A. What works well

- **Skip is always reachable** — a user who has seen the slides once is never forced through
  them again.
- **Slide content is a single array**, so adding or reordering a slide is a one-line change
  with no JSX edits.
- **No asset mis-sizing** — each slide's illustration is a real PNG at a consistent aspect
  ratio, linked from `src/assets/`, not stretched from a shared sprite.

---

## 6. QA checklist

- [ ] Slide 1 opens with dot 1 active (24 dp green pill) and two grey dots.
- [ ] Next advances 1 → 2 → 3; the active pill tracks correctly.
- [ ] On slide 3 the primary button reads **Get Started** and lands on Login.
- [ ] On slide 1 the secondary button reads **Skip** and lands on Login.
- [ ] On slides 2–3 the secondary reads **Back** and steps backwards.
- [ ] Back button on Login does **not** return to Onboarding.
- [ ] Hero image is not stretched or letterboxed; the 36 dp bottom corners are visible.
- [ ] Check on a tall device (20:9) *and* a short one — confirm what the cover-crop removes.
- [ ] Confirm no duplicate CTA is visible inside the artwork (blocked by gap #1).

---

## 7. Changing this screen

| To change… | Edit |
|---|---|
| Slide copy | `OnboardingScreen.js:9–28` — the `slides` array |
| Add/remove a slide | Same array — dots and button labels derive from `slides.length` automatically |
| Illustrations | Replace files in `apps/mobile/src/assets/`; keep the same filenames |
| Where "Get Started" goes | `OnboardingScreen.js:37` |
| Dot colours/size | `styles.dot` / `styles.activeDot` (`:133–142`) |
| Hero crop behaviour | `resizeMode` on `OnboardingScreen.js:53` |

---

**Previous:** [01 — Splash Screen](./01-splash-screen.md) · **Next:** [03 — Login Screen](./03-login-screen.md)
