import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationSchema } from '../admin-pagination';

const DateBound = z.coerce
  .date()
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

/**
 * The console's filter vocabulary for `photo_verification_statuses.key`.
 *
 * The DATABASE is the runtime authority — the query filters on the lookup
 * table's `key` column, so an operator who seeds a sixth status has one, and
 * this list only decides what the console may ASK for. It is written out here
 * for the same reason `ListAdminReportsDto` derives its enum from
 * `EFFECTIVE_STATUSES` rather than accepting free text: a typo in a filter that
 * silently returns an empty page reads as "there is nothing in the queue",
 * which is the single most dangerous wrong answer this endpoint can give.
 *
 * `failed` earns its place in the queue alongside `review_required`: both put a
 * photo in front of a human, and only one of them means the provider never
 * answered (photo-verification-schema.ts). A moderator working the queue needs
 * to be able to separate "the model is flagging things" from "Rekognition is
 * down".
 */
export const PHOTO_REVIEW_STATUS_KEYS = [
  'verifying',
  'passed',
  'review_required',
  'rejected',
  'failed',
] as const;

/**
 * The photo review queue.
 *
 * DEFAULTS DIFFER FROM EVERY OTHER ADMIN LIST, ON PURPOSE:
 *
 *   status defaults to `review_required` rather than `all`. This endpoint is a
 *     work queue before it is a browser — the default answer to "open the photo
 *     review screen" is "here is what needs deciding", not "here is every photo
 *     ever uploaded". `status=all` is one query parameter away.
 *
 *   order defaults to `asc`, where every other admin list defaults to `desc`.
 *     Newest-first is right for an audit log and wrong for a queue: each row is
 *     a real person's emergency request sitting invisible to volunteers until
 *     somebody looks at it, and the one that has waited longest is the one that
 *     needs a moderator most. Oldest-first also makes the queue drain
 *     deterministically instead of starving the bottom of the list.
 */
/**
 * The resting filter: everything a human still has to decide about.
 *
 * ⚠️ THIS IS WHY IT IS NOT JUST `review_required`. A photo whose provider call
 * never completed is recorded as `failed`, not `review_required`
 * (photo-verification.service.ts) — and with no AWS credentials configured,
 * which is the state of every environment today, `UnconfiguredModerationProvider`
 * returns `not-configured` for EVERY photo, so 100% of the backlog lands in
 * `failed`. Defaulting the queue to `review_required` alone would have shown a
 * moderator an empty screen while every held report in the system sat invisible
 * behind a filter they had no reason to change.
 *
 * That is precisely the failure this file's own header calls the most dangerous
 * wrong answer the endpoint can give: an empty page reads as "there is nothing
 * to do". The two keys stay separately selectable — telling "the model is
 * flagging things" from "Rekognition is down" is a real diagnostic need — but
 * the DEFAULT has to be the union, or the default is a lie.
 */
export const AWAITING_DECISION_STATUS_KEYS = [
  'review_required',
  'failed',
] as const;

export const ListReportPhotosSchema = PaginationSchema.extend({
  status: z
    .enum([...PHOTO_REVIEW_STATUS_KEYS, 'all', 'awaiting'])
    .default('awaiting'),

  /** The machine's overall risk band. Null risk (never analysed) matches none. */
  risk: z.enum(['low', 'medium', 'high']).optional(),

  /**
   * The REPORT's category, not the category the photo was judged against.
   *
   * They can differ — `photo_uploads.category_id` records what relevance was
   * judged on at capture time and does not follow a later category change — and
   * the console filters by what the request IS. The judged category is surfaced
   * on the detail response instead, where a `category-mismatch` reason is
   * uninterpretable without it.
   */
  categoryKey: z.string().trim().min(1).max(64).optional(),

  /** Free text over the report's title, description and landmark. */
  q: z.string().trim().min(1).max(200).optional(),

  from: DateBound.optional(),
  to: DateBound.optional(),

  /**
   * `risk` sorts by a rank expression, never by the `risk_level` column.
   * Ordering that text directly gives high / low / medium — alphabetical, and
   * exactly wrong at the top of a triage queue.
   */
  sort: z.enum(['createdAt', 'verifiedAt', 'risk']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('asc'),
}).refine((q) => !q.from || !q.to || q.from <= q.to, {
  message: '`from` must not be after `to`',
  path: ['from'],
});

export class ListReportPhotosDto extends createZodDto(ListReportPhotosSchema) {}
