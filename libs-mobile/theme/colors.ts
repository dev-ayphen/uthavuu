// Light/dark semantic color schemes for the auth-era screens (Splash excluded —
// it's a deliberate fixed-brand-green screen per docs/design/design-system.md,
// not a themed surface). Product-era screens (07+) get their own slate-based
// light/dark treatment when they're built; these are the core bg/text/border
// tokens every screen needs regardless.

export type ColorScheme = {
  bg: string;
  bgElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  disabled: string;
  primaryGreen: string;
  primaryGreenLight: string;
  danger: string;
  // Text/icon color on a solid-tint surface (a green button, a colored badge) —
  // always light, deliberately NOT theme-dependent. Never use `bg` for this: in
  // dark mode `bg` is a dark navy, which would be invisible on a green button.
  textOnTint: string;
};

export const lightColors: ColorScheme = {
  bg: '#FFFFFF',
  bgElevated: '#F8FAFC',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  disabled: '#9CA3AF',
  primaryGreen: '#16A34A',
  primaryGreenLight: '#ECFDF5',
  danger: '#DC2626',
  textOnTint: '#FFFFFF',
};

export const darkColors: ColorScheme = {
  bg: '#0F172A',
  bgElevated: '#1E293B',
  border: '#334155',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  disabled: '#475569',
  primaryGreen: '#22C55E',
  primaryGreenLight: '#064E3B',
  danger: '#F87171',
  textOnTint: '#FFFFFF',
};
