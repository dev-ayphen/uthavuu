import { sql } from 'drizzle-orm';
import { reportCategories } from '../db/schema/reports-schema';

/**
 * The one ordering every `report_categories` listing must use.
 *
 * ===================== WHY THIS FILE EXISTS ===============================
 * The mobile app and the admin console read the SAME nine rows and used to
 * disagree about their order, which is what "why are categories different?"
 * turned out to mean:
 *
 *   ReportsService.listCategories()   — no ORDER BY at all
 *   AdminCategoriesService.list()     — orderBy(asc(key))
 *
 * A query with no ORDER BY does not return rows in insertion order; it returns
 * them in whatever order the executor produced them, which for a small table is
 * heap order — and heap order CHANGES after an UPDATE, because Postgres writes a
 * new tuple version at the end of the heap rather than in place. So editing one
 * category silently reshuffled the citizen grid, and the two surfaces drifted
 * further apart with every edit. That is not a display bug, it is an absent
 * guarantee, and the fix has to be an ordering both call sites physically share
 * rather than two `orderBy` clauses that happen to match today.
 *
 * Hence one exported expression, imported by both. Adding a third listing means
 * importing this; it does not mean remembering a convention.
 * ==========================================================================
 *
 * ALPHABETICAL BY `label`, NOT BY `key`. `label` is the string a human actually
 * reads on both surfaces, and the two can diverge the moment an admin creates a
 * category through the console — nothing requires `key` to resemble `label`, and
 * `UpdateReportCategorySchema` deliberately lets `label` be edited while `key` is
 * frozen forever. Sorting by the hidden identifier would order the visible list
 * by something the reader cannot see.
 *
 * There is no `display_order` column and deliberately none planned: a
 * hand-ordered taxonomy is a second thing to maintain, and it goes stale
 * silently the first time someone adds a category and forgets to re-rank.
 */

/**
 * The ICU collation the ordering is pinned to.
 *
 * ====================== WHY AN EXPLICIT COLLATION =========================
 * A bare `ORDER BY label` is not portable between this project's databases, and
 * the difference is not cosmetic. Measured on the dev container
 * (`postgres:16-alpine`, PostgreSQL 16.15 on musl):
 *
 *   order by label                    ->  Zebra < animal
 *   order by label collate "C"        ->  Zebra < animal        (identical)
 *   order by label collate "und-x-icu" -> animal < Blood < Élan < Zebra
 *
 * The database declares `datcollate = en_US.utf8`, so the first line looks like
 * it should be locale-aware and is not: Alpine links musl, whose `strcoll`
 * ignores the locale and falls through to a byte comparison. The declared
 * collation is inert. A production Postgres on glibc would honour it and sort
 * the same query DIFFERENTLY — so "no explicit collation" means the citizen
 * category list is ordered one way in dev and another way in production, which
 * is the same class of bug as having no ORDER BY, just harder to catch.
 *
 * `und-x-icu` is the ICU root collation, and it is the right one HERE for a
 * specific reason: this list is mixed-script by design. Labels are English today
 * and Tamil is expected (CLAUDE.md § App Profile — the mobile surface ships
 * English + Tamil), so there is no single language whose rules should govern.
 * The root locale orders Latin case-insensitively at the primary level, keeps
 * accented letters beside their base letter (`Élan` sorts with E, not after Z),
 * and orders Tamil correctly among itself (அவசரம் before உதவி). `ta-x-icu` was
 * rejected: it would impose Tamil tailoring on the English-only admin console
 * for no benefit.
 *
 * THIS NAME IS A DEPENDENCY ON THE SERVER, NOT ON THE CLIENT. Referencing a
 * collation the server does not provide fails the query outright with SQLSTATE
 * 42704, so a Postgres built without ICU would break BOTH endpoints rather than
 * merely sorting them oddly. That is a loud failure rather than a silent one,
 * which is the right direction — and `report-category-order.spec.ts` asserts the
 * collation exists against the live database, so a server missing it fails a
 * test run instead of a citizen's request.
 * ==========================================================================
 */
export const CATEGORY_SORT_COLLATION = 'und-x-icu';

/**
 * `ORDER BY label COLLATE "und-x-icu", key` — a TOTAL order.
 *
 * The `key` tiebreaker is not decoration. Only `key` carries a UNIQUE
 * constraint; two categories may legitimately share a `label` (an admin
 * duplicating "Medical Help" under a new key is a mistake the schema permits and
 * the API does not refuse). With `label` alone, those two rows have no defined
 * relative order and the executor is free to swap them between calls — which is
 * the exact nondeterminism this file exists to remove, just narrowed to a rarer
 * case. `key` is NOT NULL and unique, so appending it makes the order total: for
 * any two rows there is exactly one correct answer, and both surfaces reach it.
 *
 * The tiebreaker is deliberately NOT collated. It is a machine identifier
 * constrained to `^[a-z][a-zA-Z0-9]*$` (`CreateReportCategorySchema`), so it is
 * pure ASCII and byte order is already its alphabetical order — collating it
 * would add a per-comparison cost to change nothing.
 */
export const categoryDisplayOrder = sql`${reportCategories.label} collate "${sql.raw(CATEGORY_SORT_COLLATION)}" asc, ${reportCategories.key} asc`;
