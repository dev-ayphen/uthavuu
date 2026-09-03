/**
 * Deep-path shim. The implementation moved to `@uthavu/libs-web/components`.
 *
 * It was never a moderation component: it knows about the native `<dialog>`
 * element and design tokens and nothing else, and five features outside this
 * folder were reaching across for it — `admin-accounts`, `report-categories`,
 * `comments`, `support-tickets` and `broadcasts` all imported
 * `@/features/moderation/dialog`, which is a feature importing another
 * feature's internals because that was where the only modal happened to live.
 *
 * This file stays because `features/broadcasts/send-broadcast-dialog.tsx`
 * imports through it and that lane is being edited concurrently — rewriting an
 * import in another session's open file is how two sessions produce one
 * conflict. It disappears when that lane rewrites its own import to
 * `@/components/ui`.
 */
export {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@uthavu/libs-web/components/dialog";
