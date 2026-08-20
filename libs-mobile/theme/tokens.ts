// Design tokens for apps/mobile, adopted from the color/typography audit the
// product owner provided (2026-08-19) — see docs/design/design-system.md.
// That audit describes a prototype that was never actually built (same caveat as
// docs/mobile/*.md — see docs/README.md), but the palette and type ramp it
// specifies are coherent and well-reasoned, so they're adopted here as the real
// forward design spec, same treatment as docs/API-CONTRACT.md.

export const COLORS = {
  // Brand / semantic (declared tier)
  primaryGreen: '#16A34A',
  secondaryBlue: '#2563EB',
  emergency: '#DC2626',
  warning: '#F59E0B',
  food: '#F97316',
  animal: '#8B5CF6',
  community: '#06B6D4',

  // Surfaces & text — slate family (the audit's "de facto" palette, promoted to
  // real tokens rather than left as inline hex)
  bgCanvas: '#F8FAFC',
  bgSurface: '#FFFFFF',
  bgSubtle: '#F8FAFC',
  bgMuted: '#F1F5F9',
  bgInverse: '#1E293B',
  borderDefault: '#E2E8F0',
  borderHairline: '#F1F5F9',
  // Slate family (product-era screens, 07+) — per the audit's §2.6, the auth-era
  // screens (Splash/Onboarding/Login/OTP/Permissions/ProfileSetup) stay on the
  // gray family below; don't retrofit them to slate.
  textPrimarySlate: '#0F172A',
  textSecondarySlate: '#64748B',
  textTertiary: '#94A3B8',
  textOnTint: '#FFFFFF',

  // Gray family — auth-era screens use these as textPrimary/textSecondary.
  bgWhite: '#FFFFFF',
  bgGrey: '#F8FAFC',
  borderColor: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',

  primaryGreenLight: '#ECFDF5',
  accentStrong: '#15803D',
  accentSubtle: '#F0FDF4',
  accentSubtleBorder: '#BBF7D0',
  disabled: '#CBD5E1',
  danger: '#DC2626',
  whiteMuted: 'rgba(255, 255, 255, 0.9)',

  // Informational (sky) family — docs/design/design-system.md §2.5. Used for the
  // "Explore Another Location" indicator on Dashboard: never raw hex in a screen file.
  info: '#38BDF8',
  infoStrong: '#0369A1',
  infoBg: '#E0F2FE',
  infoBorder: '#BAE6FD',
} as const;

// Category accent colors — docs/features/report-a-request.md's 8 citizen-selectable
// categories (Disaster Relief is admin-only, no accent needed here).
export const CATEGORY_COLORS = {
  animalRescue: COLORS.animal,
  medicalHelp: COLORS.emergency,
  foodDonation: COLORS.food,
  roadsideHelp: COLORS.secondaryBlue,
  elderlySupport: COLORS.primaryGreen,
  bloodDonation: COLORS.emergency,
  communityHelp: COLORS.secondaryBlue,
  lostAndFound: COLORS.warning,
} as const;

// Status tone triplets (fg/fill/border) — docs/design/design-system.md §5. Color is
// earned: neutral until something is actually urgent, then escalates amber -> red.
export const TONES = {
  normal: { fg: '#64748B', fill: '#F1F5F9', border: '#E2E8F0' },
  soon: { fg: '#B45309', fill: '#FFFBEB', border: '#FDE68A' },
  critical: { fg: '#B91C1C', fill: '#FEF2F2', border: '#FECACA' },
  expired: { fg: '#94A3B8', fill: '#F8FAFC', border: '#E2E8F0' },
  adminManaged: { fg: '#64748B', fill: '#F1F5F9', border: '#E2E8F0' },
} as const;

export const SIZES = {
  padding: 24,
  radiusSm: 8,
  radiusMd: 16,
  radiusLg: 24,
  radiusInput: 12,
} as const;

// One spacing scale for every padding/margin/gap in the app — no magic numbers in
// a screen file. Values match what was already in consistent use across screens
// (4/8/12/16/20/24/32/40), named rather than left as bare numbers.
export const SPACING = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

// One radius scale, same rule. `SIZES.radius*` above stays for backward compat with
// already-written screens; new code should prefer this clearer scale.
export const RADIUS = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 16,
  pill: 24,
  round: 27,
} as const;

// Icon sizes — benchmarked against real shipped apps' conventions, not picked
// arbitrarily: tab bar icons 22-24 (Instagram/Twitter/Uber all in this band),
// nav-bar/header action icons 20-22, inline/list icons 16-18, decorative micro
// icons 12-14.
export const ICON_SIZE = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
} as const;

// Minimum tappable area for any icon-only control — Apple HIG calls for 44x44pt,
// Material Design calls for 48x48dp; 44 is the safe floor for both platforms.
// A control's *visible* icon/box can be smaller (see ICON_SIZE) as long as the
// touch target itself is this size — never rely on hitSlop alone to make a
// sub-40pt visible box reach this floor.
export const TOUCH_TARGET = {
  min: 44,
} as const;

// One type ramp for the whole app. The 10-20 tier is docs/design/design-system.md's
// 9-step ramp verbatim (product-era screens, dense info feed, body=13 not 17). The
// 22-36 tier extends it upward for full-screen hero titles (auth flow, page titles)
// that ramp never covered — those screens had ad hoc per-screen sizes with no
// declared system (design-system.md §02: "Declared source: none"), so rather than
// preserve that drift as separate tokens, it's normalized into this same scale.
export const TYPE = {
  microLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 } as const,
  caption: { fontSize: 11, fontWeight: '400' } as const,
  captionStrong: { fontSize: 11, fontWeight: '600' } as const,
  footnote: { fontSize: 12, fontWeight: '600' } as const,
  footnoteRegular: { fontSize: 12, fontWeight: '400' } as const,
  body: { fontSize: 13, fontWeight: '400' } as const,
  bodyStrong: { fontSize: 13, fontWeight: '700' } as const,
  subhead: { fontSize: 14, fontWeight: '400' } as const,
  subheadStrong: { fontSize: 14, fontWeight: '700' } as const,
  headline: { fontSize: 15, fontWeight: '400' } as const,
  headlineStrong: { fontSize: 15, fontWeight: '700' } as const,
  title: { fontSize: 16, fontWeight: '700' } as const,
  screenTitle: { fontSize: 17, fontWeight: '700' } as const,
  display: { fontSize: 20, fontWeight: '800' } as const,
  pageTitle: { fontSize: 22, fontWeight: '700' } as const,
  heroTitle: { fontSize: 28, fontWeight: '700' } as const,
  brandTitle: { fontSize: 36, fontWeight: '700', letterSpacing: 1 } as const,
};
