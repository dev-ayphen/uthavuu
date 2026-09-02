import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AdminOnly, RequireAdminPermissions } from './admin.decorators';
import { AdminImpactStoriesService } from './admin-impact-stories.service';
import { ListImpactStoriesDto } from './dto/list-impact-stories.dto';

/**
 * Community -> Impact Stories: `/admin/impact-stories`, `/admin/impact-stories/:id`.
 *
 * Its own controller under `/admin` with one class-level `@AdminOnly()`, per
 * ADR 0009 — not a role branch on `GET /users/me/impact-stories`, which is
 * `/me`-scoped by construction and would become a privilege-escalation surface
 * the moment it grew a "list someone else's" parameter.
 *
 * `reports:manage`, which both admin roles hold — the EXISTING permission, not a
 * seventh key. Whether monetization/community sections deserve their own is open
 * question 8 (docs/_audit/open-questions.md) and is undecided; inventing a key
 * here would answer it by accident, and would also need a seed change plus a
 * migration to the role-permission rows before any current admin could load the
 * page. An Impact Story is a projection over reports and their completions, so
 * the reports permission is the honest gate for it.
 *
 * READ-ONLY. No POST/PATCH/DELETE, and therefore no AdminAuditService.record()
 * calls — ADR 0012 scopes the audit log to mutations. If a moderation action is
 * ever added here (open question 12), it arrives with its own audit action in
 * admin-audit-catalogue.ts, not as a quiet verb on this class.
 */
@Controller('admin/impact-stories')
@AdminOnly()
export class AdminImpactStoriesController {
  constructor(
    private readonly impactStoriesService: AdminImpactStoriesService,
  ) {}

  @Get()
  @RequireAdminPermissions('reports:manage')
  list(@Query() query: ListImpactStoriesDto) {
    return this.impactStoriesService.list(query);
  }

  /**
   * `:id` is the `mission_completions` id, not the report id — the story IS the
   * completion (impact-story.md BR-1), and one report has at most one.
   *
   * ParseUUIDPipe, as on /admin/reports/:id and for the same reason: this is a
   * real uuid column (unlike Better Auth's text `user.id`), so a malformed id
   * becomes a 400 instead of a database error.
   */
  @Get(':id')
  @RequireAdminPermissions('reports:manage')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.impactStoriesService.findOne(id);
  }
}
