import { Injectable } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { MissionsService } from '../missions/missions.service';

// Profile → My Impact Stories: the union of two angles this codebase
// already models separately — reports *I posted* that reached `completed`
// (ReportsService.listMine()) and missions *I volunteered for* that
// reached `completed` (MissionsService.listMyMissions(), already filtered
// to `reportStatus === 'completed'` for MyHelpsScreen's own Impact
// Stories tab). A report I both posted AND volunteered on (edge case —
// this codebase already forbids accepting your own report, so this can't
// actually happen today, but kept defensive) is de-duped by reportId
// rather than shown twice.
@Injectable()
export class ImpactStoriesService {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly missionsService: MissionsService
  ) {}

  async list(userId: string) {
    const [myReports, myMissions] = await Promise.all([
      this.reportsService.listMine(userId),
      this.missionsService.listMyMissions(userId),
    ]);

    const completedReportIds = myReports.filter((r) => r.status === 'completed').map((r) => r.id);
    // The outcome/after-photo, not the original report's before-photo — an
    // Impact Story shows what happened, not the problem that was reported.
    const completionPhotos = await this.missionsService.getCompletionPhotosByReportIds(completedReportIds);

    const stories = new Map<
      string,
      { reportId: string; title: string; category: { key: string; label: string; emoji: string }; photo: string | null; sortKey: string }
    >();

    for (const r of myReports) {
      if (r.status !== 'completed') continue;
      stories.set(r.id, {
        reportId: r.id,
        title: r.title,
        category: r.category,
        photo: completionPhotos.get(r.id) ?? r.photos[0] ?? null,
        sortKey: r.createdAt as unknown as string,
      });
    }

    for (const m of myMissions) {
      if (m.reportStatus !== 'completed' || stories.has(m.reportId)) continue;
      stories.set(m.reportId, {
        reportId: m.reportId,
        title: m.title,
        category: m.category,
        photo: m.photo,
        sortKey: m.joinedAt,
      });
    }

    return [...stories.values()]
      .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
      .map(({ sortKey: _sortKey, ...story }) => story);
  }
}
