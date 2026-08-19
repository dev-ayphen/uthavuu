# Design System — Uthavu Mobile

> Provided by the product owner (2026-08-19) as a color/typography audit. Like
> `docs/mobile/*.md`, it describes a prototype that was never actually built (no
> `apps/mobile/src/theme.js` with this content exists or ever existed) — but the
> palette and type ramp are coherent and well-reasoned, so they're adopted here as
> the real forward design spec for `apps/mobile`, the same way `docs/API-CONTRACT.md`
> is used as a draft contract rather than a verified fact. See `docs/README.md` for
> the general provenance note.
>
> **Token source of truth (code):** `apps/mobile/src/theme/tokens.ts`
>
> Only Colour and Typography are recorded below (what the product owner provided).
> Spacing/layout, shape/elevation, iconography/motion, components, and patterns
> sections don't exist yet — fill them the same way if/when they're defined.

## The one rule

**Components use the tokens in `apps/mobile/src/theme/tokens.ts`. Never raw hex.**
`COLORS.textPrimary`/`textSecondary` (gray family) are for the auth-era screens
(Splash, Onboarding, Login, OTP, Permissions, ProfileSetup) only — new screens
(07+) use `COLORS.textPrimarySlate`/`textSecondarySlate` and the rest of the slate
family. Don't retrofit the auth screens to slate; don't add more gray-family values.

## 01 — Colour

### Declared tokens (`apps/mobile/src/theme/tokens.ts` → `COLORS`)

| Token | Hex | Role |
|---|---|---|
| `primaryGreen` | `#16A34A` | Primary buttons, FAB, active tab tint, progress fill, success text, links, brand mark |
| `secondaryBlue` | `#2563EB` | Verified badge, roadside/community category, informational accents |
| `emergency` | `#DC2626` | Destructive text, urgent badge text, logout, validation errors |
| `warning` | `#F59E0B` | Medium urgency, Lost & Found category |
| `food` | `#F97316` | Food-donation category accent |
| `animal` | `#8B5CF6` | Animal-rescue category accent |
| `community` | `#06B6D4` | Community category accent (rarely used directly — mapped to `secondaryBlue` in practice) |

### Surfaces & text (slate family — product-era screens, 07+)

| Token | Hex | Role |
|---|---|---|
| `bgCanvas` / `bgSubtle` | `#F8FAFC` | Screen background, inset/secondary surface |
| `bgSurface` | `#FFFFFF` | Card surface, sheet surface |
| `bgMuted` | `#F1F5F9` | Neutral fill (chip, icon well), hairline dividers |
| `bgInverse` | `#1E293B` | Dark header surface (the one dark surface in the app) |
| `borderDefault` | `#E2E8F0` | Every card, input, chip, divider outline |
| `borderHairline` | `#F1F5F9` | Hairline divider inside a card |
| `textPrimarySlate` | `#0F172A` | Strong text / title on product-era screens |
| `textSecondarySlate` | `#64748B` | Body / secondary text on product-era screens |
| `textTertiary` | `#94A3B8` | Micro-label / muted meta text |
| `textOnTint` | `#FFFFFF` | Text on a coloured button |

### Gray family (auth-era screens only)

| Token | Hex | Role |
|---|---|---|
| `bgWhite` | `#FFFFFF` | Screen/card surface |
| `bgGrey` | `#F8FAFC` | Inset input fields |
| `borderColor` | `#E5E7EB` | Card/input borders |
| `textPrimary` | `#111827` | Titles, input text |
| `textSecondary` | `#6B7280` | Body copy, sublines |

### Category accent colors (`CATEGORY_COLORS`)

Per `docs/features/report-a-request.md`'s 8 citizen-selectable categories (Disaster
Relief is admin-only, no accent needed):

| Category | Colour |
|---|---|
| Animal Rescue | `animal` `#8B5CF6` |
| Medical Help | `emergency` `#DC2626` |
| Food Donation | `food` `#F97316` |
| Roadside Help | `secondaryBlue` `#2563EB` |
| Elderly Support | `primaryGreen` `#16A34A` |
| Blood Donation | `emergency` `#DC2626` |
| Community Help | `secondaryBlue` `#2563EB` |
| Lost & Found | `warning` `#F59E0B` |

### Status tone triplets (`TONES`)

**Rule: colour is earned.** A badge stays neutral slate while there is time, and
only escalates as the window closes — canonical for `ExpiryBadge`-style components.

| Tone | Trigger | Foreground | Fill | Border |
|---|---|---|---|---|
| `normal` | plenty of time left | `#64748B` | `#F1F5F9` | `#E2E8F0` |
| `soon` | < 1 hour left | `#B45309` | `#FFFBEB` | `#FDE68A` |
| `critical` | < 15 min left | `#B91C1C` | `#FEF2F2` | `#FECACA` |
| `expired` | window closed | `#94A3B8` | `#F8FAFC` | `#E2E8F0` |
| `adminManaged` | disaster relief | `#64748B` | `#F1F5F9` | `#E2E8F0` |

### Do / Don't

| Do | Don't |
|---|---|
| Use `primaryGreen` for the single main action on a screen | Use green as a whole-surface colour (Splash is the deliberate exception) |
| Use the fill/border/foreground triplet from `TONES` for any tinted state | Invent a new tint pair |
| Use `borderDefault` for container borders, `borderHairline` for internal dividers | Nest a bordered card inside another bordered card |
| Keep new neutrals in the slate family | Add more gray-family values on new screens |

## 02 — Typography

9-step ramp (`apps/mobile/src/theme/tokens.ts` → `TYPE`). **Body is 13px, not 17** —
this is a dense information feed, calibrated below the iOS default.

| Name | Size | Weight | Typical use |
|---|---|---|---|
| `microLabel` | 10 | 700 | Uppercase section label, `letterSpacing: 0.5` |
| `caption` | 11 | 400 | Meta, timestamps, distance |
| `footnote` | 12 | 600 | Chip labels, compact button text |
| `body` | 13 | 400 | Descriptions, list-row text |
| `bodyStrong` | 13 | 700 | List-row titles, labels |
| `subhead` | 14 | 700 | Section headings, input text, primary button |
| `headline` | 15 | 700 | Component titles |
| `title` | 16 | 700 | Card and section titles |
| `screenTitle` | 17 | 700 | Custom header title |
| `display` | 20 | 800 | Stat values, step titles |

**Weight rule:** default text is `400`; labels/titles/values/buttons are `700`.
Use `'700'` (string), never `'bold'` — same weight, keep the notation consistent.

**Line height:** only set on text that wraps (~1.35–1.45× font size). Single-line
text (labels, badges, stat values, button text) sets no line height.

**The uppercase micro-label** — the standard in-card section label treatment:

```js
{
  fontSize: 10,
  fontWeight: '700',
  color: COLORS.textTertiary,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
}
```

### Do / Don't

| Do | Don't |
|---|---|
| Pick a size from the `TYPE` ramp | Add a half-point size (`12.5`, `13.5`) |
| Write `fontWeight: '700'` | Write `fontWeight: 'bold'` |
| Set line height on any text that can wrap | Set line height on badges, labels, or button text |
| Use the micro-label block verbatim for in-card section labels | Invent a new small-caps treatment |
