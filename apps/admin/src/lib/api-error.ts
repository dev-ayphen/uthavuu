/**
 * One error type for every API call this console makes.
 *
 * Shared by server and client, so NO "server-only" here.
 *
 * The distinction this exists to preserve: **"the API said no" is not the same
 * as "the API never answered."** Collapsing them is how a login form ends up
 * telling an operator their password is wrong when the container is simply
 * down. `status === null` means the request never got a reply.
 */

export type ApiFieldError = { path: string; message: string };

export class ApiError extends Error {
  /** HTTP status, or `null` when the request never reached the API. */
  readonly status: number | null;
  /**
   * The machine-readable discriminator the API sends in the body — e.g.
   * `ADMIN_NO_SESSION`, `ADMIN_NOT_AN_ADMIN`, `ADMIN_MISSING_PERMISSION`,
   * `INVALID_EMAIL_OR_PASSWORD`. Branch on this, never on the message: the
   * message is prose and may be reworded, the code is the contract.
   */
  readonly code: string | null;
  /** Per-field messages from a Zod validation failure, ready for `setError`. */
  readonly fieldErrors: ApiFieldError[];

  constructor(
    message: string,
    options: { status?: number | null; code?: string | null; fieldErrors?: ApiFieldError[] } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.fieldErrors = options.fieldErrors ?? [];
  }

  /** True when the API never answered — DNS, connection refused, CORS, offline. */
  get isNetworkFailure(): boolean {
    return this.status === null;
  }
}

/**
 * Pull an ApiError out of a non-2xx response.
 *
 * Handles the two error envelopes this API actually emits:
 *
 *   better-auth   { message, code }
 *   NestJS + Zod  { statusCode, message, errors: [{ code, path, message }] }
 *
 * A body that is neither (an HTML error page from a proxy, an empty 502) still
 * produces a usable ApiError carrying the status, rather than throwing while
 * handling the throw.
 */
export async function toApiError(response: Response, fallbackMessage: string): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error body. The status is still the useful part.
  }

  const record = isRecord(body) ? body : {};
  const message =
    typeof record.message === "string" && record.message ? record.message : fallbackMessage;
  const code = typeof record.code === "string" ? record.code : null;

  return new ApiError(message, {
    status: response.status,
    code,
    fieldErrors: readFieldErrors(record.errors),
  });
}

/** `[{ code, path: ["timeZone"], message }]` -> `[{ path: "timeZone", message }]`. */
function readFieldErrors(raw: unknown): ApiFieldError[] {
  if (!Array.isArray(raw)) return [];

  const out: ApiFieldError[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const message = typeof entry.message === "string" ? entry.message : null;
    if (!message) continue;

    // Zod reports `path` as an array of segments. Only the first segment can
    // address a flat form field, which is all this console has.
    const path = Array.isArray(entry.path)
      ? entry.path.find((segment): segment is string => typeof segment === "string")
      : typeof entry.path === "string"
        ? entry.path
        : undefined;
    if (!path) continue;

    out.push({ path, message });
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Human-readable text for anything thrown by a fetch. Never returns empty. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.isNetworkFailure) {
    return "The console couldn't reach the API. Check that it's running and try again.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}
