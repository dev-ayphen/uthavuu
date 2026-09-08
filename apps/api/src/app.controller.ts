import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { AppService } from './app.service';
import { NoRateLimit } from './rate-limit/rate-limit.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * The liveness probe. Three properties, each load-bearing.
   *
   * ── 1. ANONYMOUS (@AllowAnonymous) ──────────────────────────────────────
   * It returned 401 until now, because the library's global AuthGuard covers
   * every route that does not opt out. A probe cannot hold a session, so a
   * liveness check that demands one always fails, and an orchestrator reading
   * that 401 concludes the container is broken and restarts a perfectly healthy
   * process — repeatedly, which is a crash loop the application did not cause.
   *
   * @AllowAnonymous is the library's own decorator (`SetMetadata("PUBLIC", true)`)
   * and is already the idiom this codebase uses for the one other unauthenticated
   * route, dev/dev-otp.controller.ts. Nothing here reads a session, so making it
   * anonymous exposes nothing: the response is a constant string.
   *
   * ── 2. NEVER RATE LIMITED (@NoRateLimit) ────────────────────────────────
   * A probe that receives a 429 is reported as an unhealthy instance, so a
   * limiter on this route can roll back a good deployment or kill a healthy
   * container by itself — the limiter succeeding at its job and the platform
   * destroying the process would be the same event. The per-IP middleware also
   * exempts `/` by path (rate-limit/rate-limit.middleware.ts); this decorator
   * covers the Nest half. Both are needed: they run at different layers.
   *
   * ── 3. LIVENESS, NOT READINESS — and it must stay that way ──────────────
   * This handler deliberately touches NOTHING. No Postgres, no Redis, no
   * platform settings. It answers exactly one question: "is this process alive
   * and serving HTTP?"
   *
   * Do not "improve" it by checking the database. A liveness probe that fails
   * when Postgres blips tells the orchestrator to kill an application that is
   * fine, turning a recoverable dependency wobble into a restart storm across
   * every instance at once — the same failure shape, and the same reasoning, as
   * the fail-open decision in rate-limit.guard.ts. If a readiness check is ever
   * wanted (should this instance receive traffic yet?), it belongs at a
   * SEPARATE path with its own semantics, so that the two questions cannot be
   * answered by one handler that gets it wrong for one of them.
   */
  @Get()
  @AllowAnonymous()
  @NoRateLimit()
  getHello(): string {
    return this.appService.getHello();
  }
}
