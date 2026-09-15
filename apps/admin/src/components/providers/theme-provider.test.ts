import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * next-themes must resolve to ONE physical copy across the workspace.
 *
 * `ThemeProvider` lives here in `apps/admin`; `ThemeToggle` lives in
 * `@uthavu/libs-web`. next-themes passes the theme through a React context, and
 * a React context is identified by the module instance that created it. pnpm
 * gives every distinct peer-dependency resolution its own directory under
 * `.pnpm/`, so if the two packages resolve next-themes against different
 * `react-dom` versions they get two directories, two module instances and two
 * contexts.
 *
 * When that happens nothing throws. `useTheme()` simply misses the provider's
 * context and falls back to next-themes' default value — `{ setTheme: () => {},
 * themes: [] }` — so the toggle renders the wrong label and clicking it does
 * nothing. That is exactly how dark mode broke once already (a511917 re-resolved
 * libs-web's next-themes peer to react-dom@19.2.8 while apps/admin stayed on
 * 19.2.3), and it is invisible to type-check, lint and every rendering test that
 * mounts provider and toggle from the same bundle.
 *
 * The guard is a resolution assertion because the failure IS a resolution
 * failure. Keep `react-dom` pinned to the same version in both package.json
 * files and this passes.
 */
describe("next-themes module resolution", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const libsWebComponents = fileURLToPath(new URL("../../../../../libs-web/components/", import.meta.url));

  it("resolves to a single copy for the provider and the shared toggle", () => {
    const fromAdmin = createRequire(here).resolve("next-themes");
    const fromLibsWeb = createRequire(libsWebComponents).resolve("next-themes");

    expect(fromLibsWeb).toBe(fromAdmin);
  });
});
