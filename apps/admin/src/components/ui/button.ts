/**
 * Deep-path shim. `src/components/layout/access-denied.tsx` imports
 * `@/components/ui/button` directly rather than through the barrel; this keeps
 * that import resolving after the implementation moved to `@uthavu/libs-web`.
 * It disappears with the barrel when feature imports are rewritten.
 */
export { Button, buttonVariants, type ButtonProps } from "@uthavu/libs-web/components/button";
