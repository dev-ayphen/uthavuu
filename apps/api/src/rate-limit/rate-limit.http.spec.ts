// Rate limiting driven through a REAL HTTP stack: real Express, real
// registration order, the real guard, the real global filter, the real
// middleware, real Redis, real headers.
//
// WHY THIS SUITE EXISTS SEPARATELY FROM THE UNIT SPECS. A green test on
// policyFor() proves the arithmetic is right in a file that nothing might be
// calling. Every claim that matters here is a claim about wiring — that the
// guard actually executes on a route, that `Retry-After` actually reaches the
// wire, that Express actually resolves the IP the way client-ip.ts says it does.
// None of those can be established by a unit test, and two of them are claims
// about someone else's code.
//
// WHAT IT CANNOT COVER, stated plainly rather than papered over. The real
// AppModule cannot boot in this suite: @thallesp/nestjs-better-auth is ESM-only
// and cannot be loaded by this package's CommonJS Jest transform — the same
// constraint admin-module-guard.spec.ts and admin-report-photos.controller.spec.ts
// both work around. So the session is placed on the request by a stub that does
// exactly what the library's AuthGuard does (`request.session = session`,
// dist/index.mjs:201) and nothing else.
//
// Two things close that gap rather than leaving it open:
//   - rate-limit-routes.spec.ts asserts the REAL controllers carry the policies
//     this suite exercises, by reading the metadata the real decorators emitted.
//   - The live container was curled directly; the transcript is in the PR notes.
//
// The controllers below are stand-ins for route SHAPES (citizen write, citizen
// read, declared policy, admin write, health), not for specific endpoints.

import 'dotenv/config';
import { Controller, Get, Post } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { RATE_LIMIT_CODES } from '@uthavu/libs-common';
import { redis } from '../lib/redis';
import { rateLimitConfig } from './rate-limit-config';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitExceptionFilter } from './rate-limit.filter';
import { createRateLimitMiddleware } from './rate-limit.middleware';
import { NoRateLimit, RateLimit } from './rate-limit.decorator';

/**
 * The 429 body, as a client would model it.
 *
 * supertest types `res.body` as `any`, so reading it directly turns every
 * assertion in this file into an unchecked one — the lint rule that flags it is
 * right, and in a suite whose entire job is to pin down a response contract,
 * asserting against `any` would be asserting against nothing.
 */
interface RateLimitBody {
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
}

const bodyOf = (response: { body: unknown }): RateLimitBody =>
  response.body as RateLimitBody;

// ── Stand-in controllers ────────────────────────────────────────────────────

@Controller()
class HealthController {
  @Get()
  @NoRateLimit()
  health(): string {
    return 'ok';
  }
}

@Controller('citizen')
class CitizenController {
  /** No decorator: exercises the `write` default. */
  @Post()
  write(): { ok: true } {
    return { ok: true };
  }

  /** No decorator: exercises the `read` default. */
  @Get()
  read(): { ok: true } {
    return { ok: true };
  }

  /** Stands in for POST /reports. */
  @Post('report')
  @RateLimit('report-create')
  report(): { ok: true } {
    return { ok: true };
  }

  /** Stands in for POST /reports/:id/messages. */
  @Post('chat')
  @RateLimit('mission-chat')
  chat(): { ok: true } {
    return { ok: true };
  }
}

/**
 * Mounted under `admin/` so RateLimitGuard.isAdminRoute() classifies it exactly
 * as it classifies the real admin controllers — off @Controller() path
 * metadata, not off the URL.
 */
@Controller('admin/test')
class AdminTestController {
  @Post()
  write(): { ok: true } {
    return { ok: true };
  }

  @Get()
  read(): { ok: true } {
    return { ok: true };
  }
}

// ── Harness ─────────────────────────────────────────────────────────────────

const RUN = `httpspec-${Date.now()}`;
let userCounter = 0;
/** A fresh identity per test, so no two tests share a Redis bucket. */
const nextUser = () => `${RUN}-u${(userCounter += 1)}`;

interface AppOptions {
  /** Env overrides read by RateLimitGuard when Nest constructs it. */
  env?: Record<string, string>;
  /** Express `trust proxy`. Defaults to 0, the production default. */
  trustProxyHops?: number;
  /** Per-IP middleware limits. Deliberately loose unless a test needs them. */
  ipGlobalMax?: number;
}

const created: NestExpressApplication[] = [];

async function makeApp(
  options: AppOptions = {},
): Promise<NestExpressApplication> {
  // RateLimitGuard reads process.env ONCE, in its constructor, so the override
  // has to be in place before Nest instantiates it — which is also an honest
  // end-to-end test of the env plumbing itself.
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(options.env ?? {})) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  try {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, CitizenController, AdminTestController],
      providers: [
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_FILTER, useClass: RateLimitExceptionFilter },
      ],
    }).compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>();

    // Exactly what main.ts does, in the same order.
    app.set('trust proxy', options.trustProxyHops ?? 0);
    app.use(
      createRateLimitMiddleware(
        rateLimitConfig({
          RATE_LIMIT_IP_GLOBAL_MAX: String(options.ipGlobalMax ?? 100_000),
          RATE_LIMIT_AUTH_MAX: '100000',
        }),
      ),
    );

    /**
     * Stands in for @thallesp/nestjs-better-auth's AuthGuard.
     *
     * It assigns `request.session` and NOTHING ELSE, which is the whole of what
     * the real guard contributes to this feature (dist/index.mjs:201). The
     * header is how THIS STUB decides who is signed in — it stands in for token
     * verification, which is not what is under test here. RateLimitGuard never
     * reads it: the guard reads `request.session.user.id`, and the test
     * "ignores a forged identity header" below proves the distinction is real.
     */
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const userId = req.header('x-test-user');
      (req as Request & { session: unknown }).session = userId
        ? { user: { id: userId } }
        : null;
      next();
    });

    await app.init();
    created.push(app);
    return app;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * Clears the `ratelimit:` namespace.
 *
 * RUN BEFORE THE SUITE AS WELL AS AFTER IT, and the "before" is not belt and
 * braces — it is the fix for a real failure. User-keyed buckets are namespaced
 * per run (see `nextUser`), but IP-keyed ones cannot be: the key is built from
 * the address the request actually arrived from, and a test that drives the
 * loopback interface has no way to make that address unique. So a second run
 * inside the first run's TTL window inherited a spent bucket and failed on
 * requests that should have been allowed. Caught by running the suite twice —
 * it passed in isolation and failed in the full suite, which is exactly the
 * shape of bug that gets committed.
 *
 * Deleting the whole namespace is safe: nothing else in this codebase writes a
 * `ratelimit:` key. The two pre-existing limiters own `otp:send:*` and
 * `upload:report-photo:*`, and rate-limit.spec.ts uses `ratelimit-spec:*`,
 * which the glob below deliberately does not match.
 *
 * SCAN rather than KEYS so a developer running this against a shared Redis is
 * not blocking it.
 */
async function clearRateLimitKeys(): Promise<void> {
  const found: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(
      cursor,
      'MATCH',
      'ratelimit:*',
      'COUNT',
      1000,
    );
    cursor = next;
    found.push(...batch);
  } while (cursor !== '0');
  if (found.length > 0) await redis.del(...found);
}

beforeAll(clearRateLimitKeys);

afterAll(async () => {
  await Promise.all(created.map((app) => app.close()));
  await clearRateLimitKeys();
  // Synchronous; leaving the connection open is what makes Jest hang.
  redis.disconnect();
});

// ── The suite ───────────────────────────────────────────────────────────────

describe('rate limiting over real HTTP', () => {
  describe('the limit is actually enforced on a wired route', () => {
    it('allows requests under the limit and refuses the one over it', async () => {
      const app = await makeApp({
        env: { RATE_LIMIT_WRITE_MAX: '3', RATE_LIMIT_WRITE_WINDOW: '60' },
      });
      const user = nextUser();
      const post = () =>
        request(app.getHttpServer()).post('/citizen').set('x-test-user', user);

      for (let i = 0; i < 3; i += 1) {
        await post().expect(201);
      }

      const refused = await post().expect(429);
      expect(refused.body).toMatchObject({
        code: 'RATE_LIMITED',
        retryAfterSeconds: expect.any(Number) as number,
      });
      expect(bodyOf(refused).retryAfterSeconds).toBeGreaterThan(0);
    });

    it('sends a Retry-After header, not just a body field', async () => {
      // The header is the half a proxy or an OS-level retry policy understands
      // without being taught our JSON. The pre-existing photo-upload 429 shipped
      // with the body field and no header; this is the regression test for that
      // whole class of omission.
      const app = await makeApp({ env: { RATE_LIMIT_WRITE_MAX: '1' } });
      const user = nextUser();
      const post = () =>
        request(app.getHttpServer()).post('/citizen').set('x-test-user', user);

      await post().expect(201);
      const refused = await post().expect(429);

      expect(refused.headers['retry-after']).toBeDefined();
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      // Header and body must agree — a client that trusted one and displayed the
      // other would show a countdown that does not match the server's.
      expect(Number(refused.headers['retry-after'])).toBe(
        bodyOf(refused).retryAfterSeconds,
      );
    });

    it('applies a route-declared policy instead of the method default', async () => {
      // Proves @RateLimit() is read from real handler metadata by the real
      // guard on a real request — the specific thing a unit test on policyFor()
      // cannot establish. `report-create` is set to 2 while the `write` default
      // is left at 1000, so a third POST /citizen/report can only be refused if
      // the DECORATOR was honoured.
      const app = await makeApp({
        env: {
          RATE_LIMIT_REPORT_CREATE_MAX: '2',
          RATE_LIMIT_WRITE_MAX: '1000',
        },
      });
      const user = nextUser();
      const post = () =>
        request(app.getHttpServer())
          .post('/citizen/report')
          .set('x-test-user', user);

      await post().expect(201);
      await post().expect(201);
      await post().expect(429);

      // ...and the undecorated sibling on the same controller is untouched,
      // proving the two policies are separate budgets rather than one counter.
      await request(app.getHttpServer())
        .post('/citizen')
        .set('x-test-user', user)
        .expect(201);
    });

    it('limits mission chat on its own budget', async () => {
      const app = await makeApp({
        env: { RATE_LIMIT_MISSION_CHAT_MAX: '2', RATE_LIMIT_WRITE_MAX: '1000' },
      });
      const user = nextUser();
      const post = () =>
        request(app.getHttpServer())
          .post('/citizen/chat')
          .set('x-test-user', user);

      await post().expect(201);
      await post().expect(201);
      await post().expect(429);
    });

    it('limits admin mutations with no decorator anywhere', async () => {
      // The requirement is "all POST/PATCH/DELETE under /admin/*". This proves
      // the classification happens from @Controller() path metadata, so a new
      // admin route is covered the moment it is added.
      const app = await makeApp({
        env: {
          RATE_LIMIT_ADMIN_WRITE_MAX: '2',
          RATE_LIMIT_ADMIN_READ_MAX: '1000',
        },
      });
      const user = nextUser();
      const post = () =>
        request(app.getHttpServer())
          .post('/admin/test')
          .set('x-test-user', user);

      await post().expect(201);
      await post().expect(201);
      await post().expect(429);

      // Admin reads are a different, looser budget — a moderator working a
      // queue must not be throttled by their own page loads.
      await request(app.getHttpServer())
        .get('/admin/test')
        .set('x-test-user', user)
        .expect(200);
    });
  });

  describe('window rollover', () => {
    it('lets the caller back in once the window expires', async () => {
      const app = await makeApp({
        env: { RATE_LIMIT_WRITE_MAX: '1', RATE_LIMIT_WRITE_WINDOW: '1' },
      });
      const user = nextUser();
      const post = () =>
        request(app.getHttpServer()).post('/citizen').set('x-test-user', user);

      await post().expect(201);
      const refused = await post().expect(429);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, 1200));

      // A limit that never rolls over is a ban, and the difference is a TTL
      // that somebody has to have actually set.
      await post().expect(201);
    });
  });

  describe('identity isolation', () => {
    it("does not spend user B's budget on user A's requests", async () => {
      const app = await makeApp({ env: { RATE_LIMIT_WRITE_MAX: '2' } });
      const alice = nextUser();
      const bob = nextUser();
      const post = (who: string) =>
        request(app.getHttpServer()).post('/citizen').set('x-test-user', who);

      await post(alice).expect(201);
      await post(alice).expect(201);
      await post(alice).expect(429);

      // A shared bucket would let one prolific reporter lock out a whole city.
      await post(bob).expect(201);
      await post(bob).expect(201);
      await post(bob).expect(429);
    });

    it('keeps 25 users behind ONE proxy IP on 25 separate budgets', async () => {
      // THE OVER-COLLAPSING TEST.
      //
      // The failure this guards against: a reverse proxy makes every user look
      // like one IP, an IP-keyed limiter merges them, and the first busy minute
      // rate-limits the entire user base off an emergency service.
      //
      // It cannot happen on any authenticated route, and the reason is
      // structural rather than lucky: RateLimitGuard keys on the session user
      // id and never consults the IP at all when one is present. Every request
      // below arrives from the identical client IP with an identical
      // X-Forwarded-For, and every user still gets their full allowance.
      const app = await makeApp({
        env: { RATE_LIMIT_WRITE_MAX: '2' },
        trustProxyHops: 1,
        ipGlobalMax: 100_000,
      });
      const users = Array.from({ length: 25 }, () => nextUser());
      const post = (who: string) =>
        request(app.getHttpServer())
          .post('/citizen')
          .set('x-test-user', who)
          // One shared origin for all 25 — the CGNAT / reverse-proxy scenario.
          .set('x-forwarded-for', '203.0.113.50');

      for (const user of users) {
        await post(user).expect(201);
        await post(user).expect(201);
      }

      // 50 successful writes from a single IP. Only the 51st from any ONE user
      // is refused, and only for that user.
      await post(users[0]).expect(429);
      await post(users[24]).expect(429);
    });

    it('keys an ANONYMOUS admin request on its IP, per IP', async () => {
      // Not a hypothetical branch. @AdminOnly() bundles OptionalAuth()
      // (admin/admin.decorators.ts) so that AdminGuard can answer every
      // rejection with one 403 instead of leaking route existence through a
      // 401 — which means an anonymous /admin/* request really does reach this
      // guard with a null session. Keying it on IP is the right answer: it
      // bounds admin-route probing, and the prober gains nothing, because
      // AdminGuard refuses them with ADMIN_NO_SESSION immediately afterwards.
      const app = await makeApp({
        env: { RATE_LIMIT_ADMIN_WRITE_MAX: '2' },
        trustProxyHops: 1,
      });
      const post = (ip: string) =>
        request(app.getHttpServer())
          .post('/admin/test')
          .set('x-forwarded-for', ip);

      await post('198.51.100.20').expect(201);
      await post('198.51.100.20').expect(201);
      await post('198.51.100.20').expect(429);

      // Separate probers, separate budgets — one prober must not be able to
      // lock the console's login surface for everyone else.
      await post('198.51.100.21').expect(201);
    });

    it("keeps two AUTHENTICATED admins off each other's budget", async () => {
      // One busy moderator working a review queue must not lock out the rest of
      // the staff. Authenticated admins key on their user id like everyone else;
      // there is no shared admin bucket anywhere in this design.
      const app = await makeApp({ env: { RATE_LIMIT_ADMIN_WRITE_MAX: '2' } });
      const alice = nextUser();
      const bob = nextUser();
      const post = (who: string) =>
        request(app.getHttpServer())
          .post('/admin/test')
          .set('x-test-user', who);

      await post(alice).expect(201);
      await post(alice).expect(201);
      await post(alice).expect(429);

      await post(bob).expect(201);
    });

    it('gives two anonymous IPs separate budgets', async () => {
      // The guard's `ip` branch, reached by sending no session at all. With
      // trust proxy 1 the resolved IP is the last X-Forwarded-For entry.
      const app = await makeApp({
        env: { RATE_LIMIT_WRITE_MAX: '2' },
        trustProxyHops: 1,
      });
      const post = (ip: string) =>
        request(app.getHttpServer())
          .post('/citizen')
          .set('x-forwarded-for', ip);

      await post('198.51.100.1').expect(201);
      await post('198.51.100.1').expect(201);
      await post('198.51.100.1').expect(429);

      await post('198.51.100.2').expect(201);
    });
  });

  describe('the spoofing vector is closed', () => {
    it('ignores X-Forwarded-For entirely at the default trust setting', async () => {
      // THE OVER-TRUSTING TEST, part 1: the shipped default.
      //
      // TRUST_PROXY_HOPS is 0 unless an operator sets it, and at 0 Express reads
      // req.socket.remoteAddress and does not look at the header at all. So a
      // client cycling a fresh forged IP on every request cannot mint a single
      // fresh bucket: all ten requests below land in the one bucket belonging to
      // the loopback socket they actually came from.
      const app = await makeApp({
        env: { RATE_LIMIT_WRITE_MAX: '3' },
        trustProxyHops: 0,
      });
      const post = (forged: string) =>
        request(app.getHttpServer())
          .post('/citizen')
          .set('x-forwarded-for', forged);

      await post('10.0.0.1').expect(201);
      await post('10.0.0.2').expect(201);
      await post('10.0.0.3').expect(201);

      // A limiter that believed the header would return 201 here, forever.
      await post('10.0.0.4').expect(429);
      await post('10.0.0.5').expect(429);
    });

    it('takes the proxy-appended hop, not the client-supplied one', async () => {
      // THE OVER-TRUSTING TEST, part 2: correctly configured behind one proxy.
      //
      // With trust proxy = 1, Express counts hops from the socket end and reads
      // X-Forwarded-For RIGHT TO LEFT. A real proxy APPENDS the address it saw,
      // so the right-hand entry is infrastructure's and the left-hand entries
      // are whatever the client wrote.
      //
      // Here the attacker prepends a different forged address every time while
      // the "proxy" appends their true one. The forged prefix is ignored and all
      // the requests share one bucket — which is the entire reason the setting
      // is a NUMBER and not `true`. With `trust proxy: true` Express would take
      // the LEFT-most entry and every line below would be a fresh allowance.
      const app = await makeApp({
        env: { RATE_LIMIT_WRITE_MAX: '2' },
        trustProxyHops: 1,
      });
      const truth = '203.0.113.77';
      const post = (forgedPrefix: string) =>
        request(app.getHttpServer())
          .post('/citizen')
          .set('x-forwarded-for', `${forgedPrefix}, ${truth}`);

      await post('1.1.1.1').expect(201);
      await post('2.2.2.2').expect(201);
      await post('3.3.3.3').expect(429);
      await post('4.4.4.4').expect(429);
    });

    it('ignores a forged identity header on an authenticated request', async () => {
      // Keys come from the session, never from anything the caller can type.
      // Both requests below carry a different X-Forwarded-For AND a different
      // User-Agent; the only thing that decides the bucket is the session.
      const app = await makeApp({
        env: { RATE_LIMIT_WRITE_MAX: '1' },
        trustProxyHops: 1,
      });
      const user = nextUser();

      await request(app.getHttpServer())
        .post('/citizen')
        .set('x-test-user', user)
        .set('x-forwarded-for', '203.0.113.1')
        .set('user-agent', 'agent-one')
        .expect(201);

      await request(app.getHttpServer())
        .post('/citizen')
        .set('x-test-user', user)
        .set('x-forwarded-for', '198.51.100.9')
        .set('user-agent', 'agent-two')
        .expect(429);
    });

    it('cannot be escaped by dropping the session token', async () => {
      // The token-dropping hop, tested on the one route shape where it is even
      // conceivable. In the real API it is not: every Nest route sits behind the
      // Better Auth guard with no @Public() anywhere, so an unauthenticated
      // request is refused with 401 long before this guard runs. Here the
      // anonymous request DOES reach the guard, and it still does not get a free
      // pass — it lands in the IP bucket, which the per-IP middleware has been
      // charging all along.
      const app = await makeApp({
        env: { RATE_LIMIT_WRITE_MAX: '1' },
        trustProxyHops: 1,
        ipGlobalMax: 3,
      });
      const user = nextUser();
      const ip = '203.0.113.200';

      await request(app.getHttpServer())
        .post('/citizen')
        .set('x-test-user', user)
        .set('x-forwarded-for', ip)
        .expect(201);
      await request(app.getHttpServer())
        .post('/citizen')
        .set('x-test-user', user)
        .set('x-forwarded-for', ip)
        .expect(429);

      // Drop the token: a fresh USER bucket is not available, and the IP ceiling
      // has been counting every one of these requests since the first.
      await request(app.getHttpServer())
        .post('/citizen')
        .set('x-forwarded-for', ip)
        .expect(201);
      const capped = await request(app.getHttpServer())
        .post('/citizen')
        .set('x-forwarded-for', ip);
      expect(capped.status).toBe(429);
    });
  });

  describe('the per-IP middleware', () => {
    it('refuses before any guard runs, with the same 429 shape', async () => {
      const app = await makeApp({ ipGlobalMax: 2, trustProxyHops: 1 });
      const ip = '203.0.113.111';
      const get = () =>
        request(app.getHttpServer())
          .get('/citizen')
          .set('x-forwarded-for', ip)
          .set('x-test-user', nextUser());

      await get().expect(200);
      await get().expect(200);

      const refused = await get().expect(429);
      // Written by hand in raw Express (no exception filter reaches it), so this
      // is the assertion that keeps the two code paths from drifting apart.
      expect(refused.headers['retry-after']).toBeDefined();
      expect(refused.body).toMatchObject({
        code: expect.any(String) as string,
        message: expect.any(String) as string,
        retryAfterSeconds: expect.any(Number) as number,
      });
    });
  });

  describe('the health endpoint', () => {
    it('is never throttled, by the guard or by the middleware', async () => {
      // A liveness probe that gets a 429 is reported as an unhealthy instance,
      // so a limiter on this route can restart a healthy container or roll back
      // a good deploy entirely on its own. Every other limit here is set to 1.
      const app = await makeApp({
        env: {
          RATE_LIMIT_READ_MAX: '1',
          RATE_LIMIT_WRITE_MAX: '1',
        },
        ipGlobalMax: 1,
        trustProxyHops: 1,
      });

      // Exhaust the per-IP ceiling from this address on a different route
      // first, so the health check is running against an already-spent bucket.
      await request(app.getHttpServer())
        .get('/citizen')
        .set('x-forwarded-for', '203.0.113.250')
        .set('x-test-user', nextUser())
        .expect(200);
      await request(app.getHttpServer())
        .get('/citizen')
        .set('x-forwarded-for', '203.0.113.250')
        .set('x-test-user', nextUser())
        .expect(429);

      for (let i = 0; i < 25; i += 1) {
        await request(app.getHttpServer())
          .get('/')
          .set('x-forwarded-for', '203.0.113.250')
          .expect(200);
      }
    });
  });

  describe('a Redis outage', () => {
    it('fails OPEN rather than taking the product down', async () => {
      // The deliberate choice, asserted rather than described. Uthavu is how
      // somebody asks for help in an emergency; a Redis blip must not turn
      // POST /reports into a 429. What is lost while Redis is down is
      // throttling — authentication, authorisation, suspension and maintenance
      // mode are all unaffected, because none of them touch Redis.
      const app = await makeApp({ env: { RATE_LIMIT_WRITE_MAX: '1' } });
      const user = nextUser();

      const spy = jest
        .spyOn(redis, 'incr')
        .mockRejectedValue(new Error('connection refused'));
      try {
        for (let i = 0; i < 5; i += 1) {
          await request(app.getHttpServer())
            .post('/citizen')
            .set('x-test-user', user)
            .expect(201);
        }
      } finally {
        spy.mockRestore();
      }

      // ...and enforcement resumes the moment Redis is back, with no restart.
      await request(app.getHttpServer())
        .post('/citizen')
        .set('x-test-user', user)
        .expect(201);
      await request(app.getHttpServer())
        .post('/citizen')
        .set('x-test-user', user)
        .expect(429);
    });
  });

  describe('the 429 contract is uniform', () => {
    it('is the same shape on every limited surface', async () => {
      // The owner's requirement: "The mobile/admin clients should not need five
      // different ways to recognize rate limiting." This asserts that ONE
      // client-side predicate works on every surface the Nest side raises.
      const app = await makeApp({
        env: {
          RATE_LIMIT_WRITE_MAX: '1',
          RATE_LIMIT_REPORT_CREATE_MAX: '1',
          RATE_LIMIT_MISSION_CHAT_MAX: '1',
          RATE_LIMIT_ADMIN_WRITE_MAX: '1',
        },
        // The per-IP ceiling is left wide open on purpose: this test is about
        // the GUARD's 429 shape, and every request below comes from the same
        // loopback address, so a tight ip-global would refuse them from the
        // middleware instead and prove nothing about the guard.
        ipGlobalMax: 100_000,
      });

      const surfaces: ReadonlyArray<readonly [string, string]> = [
        ['citizen write (generic)', '/citizen'],
        ['report creation', '/citizen/report'],
        ['mission chat', '/citizen/chat'],
        ['admin mutation', '/admin/test'],
      ];

      for (const [label, path] of surfaces) {
        const user = nextUser();
        const post = () =>
          request(app.getHttpServer()).post(path).set('x-test-user', user);

        await post().expect(201);
        const refused = await post();

        // The single predicate a client is expected to write.
        const body = bodyOf(refused);
        const isRateLimited =
          refused.status === 429 &&
          RATE_LIMIT_CODES.includes(body.code as never) &&
          typeof body.retryAfterSeconds === 'number' &&
          refused.headers['retry-after'] !== undefined;

        expect({ label, isRateLimited }).toEqual({
          label,
          isRateLimited: true,
        });
      }
    });
  });
});
