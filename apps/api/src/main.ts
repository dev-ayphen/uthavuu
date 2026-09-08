import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOADS_DIR } from './uploads/multer.config';
import { trustProxyHops } from './rate-limit/client-ip';
import { createRateLimitMiddleware } from './rate-limit/rate-limit.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // @thallesp/nestjs-better-auth needs the raw body for its own routes and
    // re-adds JSON/urlencoded parsing for everything else (see AuthModule.forRoot
    // bodyParser option in app.module.ts) — don't add express.json() separately.
    bodyParser: false,
  });

  // ── Rate limiting, part 1 of 2: how the client IP is resolved ────────────
  //
  // This one line decides whether every IP-keyed limit in the API is real or
  // decorative, so it is set explicitly rather than left at Express's default.
  //
  // A NUMBER, never `true`. Express reads `trust proxy: true` as "the client is
  // the LEFT-MOST entry of X-Forwarded-For" — an entry the client itself wrote,
  // which lets anyone mint an unlimited supply of fresh rate-limit buckets with
  // a header. A number counts hops from the socket end instead, right to left,
  // landing on the address the last trusted proxy actually observed.
  //
  // Defaults to 0 (ignore X-Forwarded-For entirely) so an unset variable
  // over-counts rather than under-counts. Vercel — the deployment target — is
  // exactly one hop and documents that it OVERWRITES X-Forwarded-For to prevent
  // spoofing, so set TRUST_PROXY_HOPS=1 there. Full reasoning in
  // rate-limit/client-ip.ts.
  app.set('trust proxy', trustProxyHops());

  // ── Rate limiting, part 2 of 2: the per-IP layer ─────────────────────────
  //
  // REGISTERED HERE, AND THE POSITION IS LOAD-BEARING. Express dispatches
  // middleware in registration order, and this must run before:
  //
  //   - AuthModule's `httpAdapter.use()`, which is where Better Auth's own
  //     routes live (they are raw Express, so no Nest guard can ever limit
  //     login, OTP verify, or admin sign-in/email);
  //   - `useStaticAssets()` below;
  //   - every Nest guard, including the AuthGuard that 401s anonymous traffic —
  //     a 401 still costs a session lookup, and unlimited 401s are still an
  //     attack.
  //
  // AuthModule's middleware is registered during `app.init()`, which `listen()`
  // triggers below, so installing it at this point in bootstrap puts it first.
  //
  // The per-USER half of the limiter is RateLimitGuard, registered by
  // RateLimitModule in app.module.ts. This half cannot key on a user because it
  // runs before anything has authenticated one; that is precisely its job.
  app.use(createRateLimitMiddleware());

  // CORS for the admin console. Declared here rather than inherited from
  // AuthModule's `trustedOrigins`-derived CORS, which is why app.module.ts sets
  // `disableTrustedOriginsCors: true` — running both would emit
  // `Access-Control-Allow-Origin` twice, which browsers reject outright.
  //
  // Two reasons this is worth owning explicitly. First, the library's method
  // list is GET/POST/PUT/DELETE with no PATCH, and the console's moderation
  // actions are PATCHes — that omission surfaces as a mystifying CORS failure
  // on the first non-GET the console tries. Second, CORS for the whole Nest API
  // should not be a side effect of how auth happens to be configured.
  //
  // `origin` is an exact-match allowlist read from env, never '*': every admin
  // request carries a session cookie, so responses set
  // `Access-Control-Allow-Credentials: true`, and a browser refuses to pair
  // that with a wildcard. An unset ADMIN_URL leaves the list empty, which
  // refuses every cross-origin caller — the right way to fail.
  //
  // None of this touches mobile: it sends a Bearer token, no cookie and no
  // Origin header, so CORS never engages for it.
  //
  // Better Auth keeps its own `trustedOrigins` check (src/auth/auth.ts). That
  // is a cross-site request defence on the auth routes, not a CORS setting, and
  // it is deliberately not replaced by this.
  const allowedOrigins = [process.env.ADMIN_URL].filter(
    (value): value is string => Boolean(value),
  );
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  // Serves uploaded avatars back out as plain static files — not behind the
  // global auth guard (Express static middleware runs outside Nest's router),
  // which is correct: an avatar URL needs to be publicly viewable, only the
  // upload itself (UploadsController) requires a session.
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
