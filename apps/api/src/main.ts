import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOADS_DIR } from './uploads/multer.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // @thallesp/nestjs-better-auth needs the raw body for its own routes and
    // re-adds JSON/urlencoded parsing for everything else (see AuthModule.forRoot
    // bodyParser option in app.module.ts) — don't add express.json() separately.
    bodyParser: false,
  });

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
