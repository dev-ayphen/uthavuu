import { z } from "zod";

/**
 * The reply composer's schema.
 *
 * WHAT IS MIRRORED FROM THE BACKEND, AND WHAT IS NOT
 * ───────────────────────────────────────────────────────────────────────────
 * The bound below is transcribed from `CreateTicketReplySchema` in
 * `apps/api/src/admin/dto/create-ticket-reply.dto.ts` — `body` is
 * `.trim().min(1).max(2000)` — and matches it EXACTLY, in both directions. A
 * client rule LOOSER than the server produces a 400 the operator has to decode;
 * a client rule STRICTER than the server silently refuses a message the API
 * would have accepted, which is the harder bug to notice because nothing ever
 * errors. The limit is also shown as a live counter beside the box, so an agent
 * meets a visible number rather than an invisible wall.
 *
 * `isInternalNote` IS NOT IN THIS SCHEMA, deliberately — see the note on
 * composer mode in `ticket-composer.tsx`. It is not a value being validated, it
 * is which of two different actions the agent is taking, and folding it into
 * the form's values would let a `reset()` quietly change the audience of the
 * next message. The API's DTO defaults it to `false`; the composer nonetheless
 * sends it explicitly on every request, so that default is never the thing
 * deciding who reads a message.
 */

/** From `CreateTicketReplySchema.body`. Mirrors the DTO exactly. */
export const MESSAGE_MAX = 2000;

export const messageFormSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something before sending.")
    .max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX} characters.`),
});

export type MessageFormValues = z.infer<typeof messageFormSchema>;

/** Every field a server `validationErrors` entry is allowed to land on. */
const MESSAGE_FIELD_NAMES = ["body"] as const satisfies readonly (keyof MessageFormValues)[];

export function isMessageFieldName(path: string): path is keyof MessageFormValues {
  return (MESSAGE_FIELD_NAMES as readonly string[]).includes(path);
}
