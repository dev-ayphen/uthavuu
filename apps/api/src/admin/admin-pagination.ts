import { z } from 'zod';

/**
 * The one pagination contract every admin list endpoint uses.
 *
 * There is no pagination anywhere else in this API — every citizen endpoint
 * returns its whole result set, which is fine for ~20 nearby cards on a phone
 * and is exactly what makes those endpoints unusable for a dense desktop table
 * (docs/architecture/admin-console-integration.md §3, gap R-1). Offset
 * pagination, not keyset: the console's tables are sortable by several columns
 * and show a page count, both of which keyset paging makes awkward, and the row
 * counts here are thousands, not millions.
 *
 * `limit` is capped at 100 per .claude/agents/backend-agent.md §4. The cap is
 * the point — without it, `?limit=1000000` is a one-request denial of service
 * against an admin session that is allowed to read everything.
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export function paginate<T>(
  items: T[],
  total: number,
  { page, limit }: { page: number; limit: number },
): Paginated<T> {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      // Ceil, and 0 (not 1) for an empty result. A console that renders
      // "Page 1 of 0" is telling the truth about an empty table; "Page 1 of 1"
      // suggests there is a page to look at.
      totalPages: Math.ceil(total / limit),
    },
  };
}

/** Offset for a 1-based page number. */
export function offsetFor({ page, limit }: { page: number; limit: number }) {
  return (page - 1) * limit;
}

/**
 * Free-text search input, normalised for a case-insensitive LIKE.
 *
 * `%` and `_` are LIKE metacharacters: a raw `%` typed into the console's search
 * box would silently match everything. Escaping them (with `\` as the escape
 * character, declared via ESCAPE in the SQL) makes the search box mean what a
 * user typing into a search box expects it to mean. Drizzle parameterises the
 * value, so this is about semantics, not injection.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
