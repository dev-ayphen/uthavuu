"use client";

import Link from "next/link";
import { ArrowRight, Clock, Image as ImageIcon, Users } from "lucide-react";

import {
  DetailBody,
  DetailField,
  DetailFields,
  DetailHeader,
  DetailSection,
  DetailSkeleton,
  MutedCell,
  formatDate,
} from "@/components/data";
import { Card, MetricTile } from "@/components/ui";
import { DetailFallback } from "@/features/moderation/detail-query";
import { reportDetailHref } from "@/features/moderation/routes";
import { IMPACT_STORIES_HREF } from "./routes";
import { StoryHelperCell, StoryReporterCell, VolunteerIdentity } from "./story-identity";
import { StoryPhoto } from "./story-photo";
import { StoryStatusBadge, VolunteerStatusBadge } from "./story-status-badge";
import { formatDuration, useImpactStory } from "./use-impact-stories";
import type { ImpactStoryDetail as Story } from "./types";

/**
 * One Impact Story, in full.
 *
 * READ-ONLY BY CONSTRUCTION, on both sides. `AdminImpactStoriesController`
 * publishes no POST, PATCH or DELETE, so there is nothing to call — and that is
 * not an oversight to fill in. Whether Impact Stories need an approval workflow
 * is open question 12 and is undecided; rendering an "Approve" button would
 * decide it by accident, in the UI, where product decisions do not belong. If
 * the answer ever comes back "yes", it arrives as an endpoint with its own audit
 * action (ADR 0012), and the buttons follow it — not the other way round.
 *
 * `DetailHeader` therefore takes no `actions` prop. That is deliberate; please
 * do not add one without an endpoint behind it.
 */
export function StoryDetail({ storyId }: { storyId: string }) {
  const { view } = useImpactStory(storyId);

  if (view.kind === "loading") return <DetailSkeleton fields={8} />;

  if (view.kind !== "ready") {
    return (
      <DetailFallback
        view={view}
        notFoundTitle="No such impact story"
        notFoundDescription="Nothing here matches that id. A story disappears when its report is removed — the report itself, and who removed it, is still readable under Reports."
        backHref={IMPACT_STORIES_HREF}
        backLabel="Back to impact stories"
      />
    );
  }

  return <StoryRecord story={view.record} />;
}

function StoryRecord({ story }: { story: Story }) {
  const duration = formatDuration(story.durationMinutes);

  return (
    <DetailBody>
      <DetailHeader
        backHref={IMPACT_STORIES_HREF}
        backLabel="Back to impact stories"
        eyebrow={story.category.label}
        title={story.reportTitle}
        subtitle={
          story.note ? (
            // The completion note is the story's caption (BR-2). It is
            // user-generated and frequently Tamil — `--font-sans` lists Noto
            // Sans Tamil behind Inter, so Tamil codepoints fall through to a
            // face that has the glyphs with no `lang` switch needed here.
            <span className="text-xs whitespace-pre-wrap">{story.note}</span>
          ) : undefined
        }
        badges={
          <>
            <StoryStatusBadge status={story.status} />
            {duration ? (
              <span className="rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-subtle">
                Helped in {duration}
              </span>
            ) : null}
          </>
        }
      />

      {/*
        THE BEFORE/AFTER PAIR IS THE STORY.
        It leads the page rather than sitting in a gallery halfway down, because
        this record exists to show that something changed. A missing "before" is
        a fact about the story (not every report carries a photo) and reads
        differently from a photo whose file has gone — see story-photo.tsx.
      */}
      <DetailSection
        title="Before and after"
        description="The report's first photo, and the proof the volunteer submitted on completion."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <StoryFrame label="Before" url={story.beforePhotoUrl} />
          <StoryFrame label="After" url={story.afterPhotoUrl} />
        </div>
      </DetailSection>

      <DetailSection title="At a glance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricTile
            label="Request raised → help submitted"
            value={duration ?? "—"}
            icon={Clock}
            accent="emerald"
          />
          <MetricTile
            label="On the roster"
            value={story.volunteers.length}
            icon={Users}
            accent="violet"
          />
          {/* "Report photos", not "Photos": `story.photos` is the report's own
              photos only. The after-shot lives on the completion and arrives as
              `afterPhotoUrl`, so a bare "Photos: 2" would undercount by the one
              image this whole record exists to show. */}
          <MetricTile
            label="Report photos"
            value={story.photos.length}
            icon={ImageIcon}
            accent="cyan"
          />
        </div>
      </DetailSection>

      <DetailSection title="The story">
        <DetailFields columns={3}>
          <DetailField label="What was asked for" span={3}>
            {story.reportDescription ? (
              <p className="text-sm whitespace-pre-wrap">{story.reportDescription}</p>
            ) : (
              <MutedCell value={null} />
            )}
          </DetailField>

          <DetailField label="Completion note" span={3}>
            {story.note ? (
              <p className="text-sm whitespace-pre-wrap">{story.note}</p>
            ) : (
              <MutedCell value={null} />
            )}
          </DetailField>

          {/* Two people, two different privacy stories. The reporter cell can
              say "Deleted account", "Posted anonymously" or a real name, and
              those are three different facts (data.md invariant 3). The helper
              has no anonymity concept at all, so it never claims one. */}
          <DetailField label="Asked for help">
            <StoryReporterCell story={story} />
          </DetailField>
          <DetailField label="Helped by">
            <StoryHelperCell story={story} />
          </DetailField>
          <DetailField label="Category">
            <MutedCell value={story.category.label} />
          </DetailField>

          <DetailField label="Submitted">
            <span className="tabular">{formatDate(story.submittedAt, true) ?? "—"}</span>
          </DetailField>
          <DetailField label="Verified">
            <MutedCell value={formatDate(story.verifiedAt, true)} />
          </DetailField>
          <DetailField label="Took">
            <MutedCell value={duration} />
          </DetailField>

          <DetailField label="Original report">
            <Link
              href={reportDetailHref(story.reportId)}
              className="inline-flex items-center gap-1 rounded-control text-xs font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open in Reports
              <ArrowRight aria-hidden className="size-3" />
            </Link>
          </DetailField>
          <DetailField label="Story id" span={2}>
            <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {story.id}
            </code>
          </DetailField>
        </DetailFields>
      </DetailSection>

      {story.photos.length > 0 ? (
        <DetailSection
          title={`Report photos (${story.photos.length})`}
          description="Everything the reporter attached to the request, oldest first — the first is the “before” shot above. The volunteer's completion photo is the “after” shot and is not one of these."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {story.photos.map((url, index) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-card border border-border bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <StoryPhoto
                  url={url}
                  alt={`Report photo ${index + 1}`}
                  sizes="(min-width: 1024px) 20vw, (min-width: 640px) 30vw, 45vw"
                  className="transition-transform group-hover:scale-[1.02]"
                />
              </a>
            ))}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection
        title="Volunteer roster"
        description="Everyone who joined this mission. The status is the stored value and is evaluated lazily, so on a finished mission it records how far each person got — not who is helping now."
      >
        {story.volunteers.length === 0 ? (
          <Card>
            <p className="p-4 text-xs text-fg-faint">
              No roster rows on this mission. The completion still names who submitted it.
            </p>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {story.volunteers.map((volunteer, index) => (
                <li
                  key={volunteer.userId ?? `deleted-${index}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <VolunteerIdentity userId={volunteer.userId} name={volunteer.name} />
                  </div>
                  <VolunteerStatusBadge status={volunteer.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </DetailSection>

      {/*
        ==========================================================================
        MISSION CHAT IS NOT HERE, AND MUST NOT BE ADDED.
        ==========================================================================
        `GET /admin/impact-stories/:id` returns the completion, its photos and the
        volunteer roster. It does not return `mission_messages`, and no admin
        endpoint does. ADR 0010 decided it: admins never read the private thread
        between a reporter and the volunteers who accepted — not in a mission
        projection, not as a count, not as a preview, not behind `super_admin`.
        `hasActiveAccess()` stays the only authority on chat access.

        Deliberately absent too is a "chat not available" placeholder. A
        placeholder is a promise, and this one would be a promise to break a
        privacy guarantee the product makes to its users. If chat moderation is
        ever needed it arrives as its own feature with its own ADR superseding
        0010, its own disclosure language and its own audit action — never as a
        widened projection on an endpoint built for something else.

        ==========================================================================
        AND THERE ARE NO MODERATION CONTROLS ON THIS PAGE.
        ==========================================================================
        No approve, no reject, no publish, no take-down. The API offers no verb,
        and open question 12 has not been answered. The report behind this story
        IS moderatable, at /reports/[id] — that link is in "Original report" above.
      */}
    </DetailBody>
  );
}

/** One half of the before/after pair, labelled so the two can never be swapped. */
function StoryFrame({ label, url }: { label: string; url: string | null }) {
  return (
    <figure className="min-w-0">
      <figcaption className="micro-label mb-1.5">{label}</figcaption>
      <div className="overflow-hidden rounded-card border border-border bg-surface-2">
        <StoryPhoto url={url} alt={label} sizes="(min-width: 640px) 40vw, 90vw" />
      </div>
    </figure>
  );
}
