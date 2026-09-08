// Resolving the client IP, which is the whole ballgame for any IP-keyed limit.
//
// A rate limit keyed on a value the caller controls is not a rate limit. It is a
// counter the attacker resets whenever they like, plus a false sense of having
// done something. Everything in this file exists to make sure the IP we key on
// came from infrastructure we trust and not from the request.
//
// ── THE TRAP ────────────────────────────────────────────────────────────────
// `X-Forwarded-For` is a plain request header. Anyone can send one. It is only
// trustworthy to the extent that a proxy you control appended to it, and only
// for the entries that proxy added.
//
// Express's `trust proxy` setting decides how much of it to believe, and the
// three settings behave very differently (quoted from the Express guide,
// "Express behind proxies", read 2026-09-08 rather than recalled):
//
//   false (the default)  "the app is understood as directly facing the client
//                        and the client's IP address is derived from
//                        req.socket.remoteAddress". X-Forwarded-For is ignored
//                        entirely. UNSPOOFABLE.
//
//   true                 "the client's IP address is understood as the LEFT-MOST
//                        entry in the X-Forwarded-For header". The left-most
//                        entry is the one the client wrote. FULLY SPOOFABLE —
//                        `curl -H 'X-Forwarded-For: <random>'` mints a fresh
//                        bucket on every request. Never set this.
//
//   a number n           "Use the address that is at most n number of hops away
//                        from the Express application. req.socket.remoteAddress
//                        is the first hop, and the rest are looked for in the
//                        X-Forwarded-For header FROM RIGHT TO LEFT."
//
// Right-to-left is the property that matters. Entries are appended by each
// proxy, so the right-hand end of the list is the part written by infrastructure
// nearest us, and the left-hand end is the part the client made up. Counting
// hops from the right skips exactly the proxies we said we have and lands on the
// address the last trusted proxy actually observed. A client that prepends
// `X-Forwarded-For: 9.9.9.9` only pushes its own garbage further left, where
// nothing reads it.
//
// ── THIS DEPLOYMENT ─────────────────────────────────────────────────────────
// Vercel is the target (CLAUDE.md § Stack Summary), and Vercel's own request
// header reference says of X-Forwarded-For: "If you are trying to use Vercel
// behind a proxy, we currently overwrite the X-Forwarded-For header and do not
// forward external IPs. This restriction is in place to prevent IP spoofing."
// So on Vercel the header holds exactly one address, put there by Vercel, and
// there is exactly one trusted hop in front of the app: TRUST_PROXY_HOPS=1.
//
// ── WHY THE DEFAULT IS 0 AND NOT 1 ──────────────────────────────────────────
// An unset variable must fail in the direction that cannot be exploited. With 0
// the header is ignored, so the worst case is over-counting: everyone behind a
// proxy shares one bucket and legitimate users get throttled early. With a
// too-high value the worst case is under-counting: the limiter reads an
// attacker-supplied string and every request gets its own fresh allowance,
// which is indistinguishable from having no limiter at all. Over-throttling is
// visible and gets fixed within minutes of a deploy; a silently spoofable
// limiter is discovered by the incident it failed to prevent.
//
// The generous per-IP ceiling in rate-limit-config.ts (`ip-global`) is sized so
// that even the collapsed-to-one-bucket failure mode is survivable rather than
// instantly fatal, which is what buys those minutes.

/** Express's `trust proxy` value, and the env var that sets it. */
export const TRUST_PROXY_HOPS_ENV = 'TRUST_PROXY_HOPS';

/**
 * How many reverse proxies sit between this app and the public internet.
 *
 * 0 (the default) means "none — ignore X-Forwarded-For". 1 is correct on Vercel.
 * A value that fails to parse falls back to 0 for the reason above: a typo must
 * not silently widen trust.
 */
export function trustProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[TRUST_PROXY_HOPS_ENV];
  if (raw === undefined || raw.trim() === '') return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

/** The subset of an Express request this module reads. */
export interface IpBearingRequest {
  ip?: string | undefined;
  socket?: { remoteAddress?: string | undefined } | undefined;
}

/**
 * The bucket identity for an unauthenticated caller.
 *
 * Reads `req.ip`, which Express has ALREADY resolved according to the
 * `trust proxy` setting main.ts applied — this function deliberately does not
 * parse `X-Forwarded-For` itself. Re-deriving it here would mean two places
 * that could disagree about which hop to take, and the one that disagreed
 * quietly would be the one keying the limiter.
 *
 * `unknown` is a real bucket, not a bypass. A request with no resolvable
 * address at all is rare (it means the socket is gone), and lumping those
 * together is the same call otp-rate-limiter.ts makes for an un-normalisable
 * phone number: "refusing to count it would make garbage input the cheapest
 * bypass of all."
 */
export function clientIpFor(request: IpBearingRequest): string {
  const raw = request.ip ?? request.socket?.remoteAddress;
  if (!raw) return 'unknown';
  return normalizeIp(raw);
}

/**
 * Collapses the two spellings of one address into one bucket.
 *
 * Node reports IPv4 clients on a dual-stack listener as IPv4-mapped IPv6
 * (`::ffff:127.0.0.1`), while a proxy's X-Forwarded-For writes the plain form
 * (`127.0.0.1`). Left alone, the same machine reaching the same server over two
 * paths would get two allowances. Case is normalised for the same reason —
 * IPv6 is hex and `::FFFF:` and `::ffff:` are the same address.
 */
export function normalizeIp(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.startsWith('::ffff:')
    ? trimmed.slice('::ffff:'.length)
    : trimmed;
}
