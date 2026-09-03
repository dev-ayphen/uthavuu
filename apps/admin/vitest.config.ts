import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests for the console's decision logic.
 *
 * `node` rather than jsdom, and no React plugin: what is worth testing here is
 * the logic that decides things — which nav entries an admin may see, what an
 * API refusal code means, whether a placement is deliverable. Those are pure
 * functions. Rendering tests need jsdom and Testing Library, which is a
 * separate decision with a real dependency cost; this is deliberately the
 * cheapest setup that covers the rules with teeth.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
