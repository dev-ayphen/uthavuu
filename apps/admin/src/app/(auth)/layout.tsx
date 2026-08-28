/**
 * The unauthenticated area.
 *
 * `data-theme="dark"` is pinned here on purpose. The sign-in screen is a
 * full-bleed photographic hero with white type over it — it is a single
 * committed composition, not a surface that has a light counterpart, and the
 * approved design only ever shows it dark.
 *
 * This works because the theme tokens are declared on an ATTRIBUTE selector
 * rather than on :root alone, so any element carrying `data-theme` re-scopes
 * the whole palette for its subtree. The console's own light/dark toggle is
 * unaffected — it lives in the app shell, which is not rendered here.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="min-h-svh bg-canvas text-fg">
      {children}
    </div>
  );
}
