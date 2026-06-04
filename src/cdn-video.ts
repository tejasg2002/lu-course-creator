import type { CourseJourney, JourneyStep } from "./journey-types.js";
import type { CoursePlan, PlannedContent, TopicDraft } from "./types.js";
import {
  filterTeachingSteps,
  isNonTeachingTopic,
  isYoutubeUrl,
  preferCdnUrl,
} from "./topic-scope.js";

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findJourneyStepForTopic(
  topicTitle: string,
  journey: CourseJourney
): JourneyStep | undefined {
  const want = normalizeTitle(topicTitle);
  const steps = filterTeachingSteps(journey.steps);
  const exact = steps.find((s) => normalizeTitle(s.title) === want);
  if (exact) return exact;
  return steps.find((s) => {
    const got = normalizeTitle(s.title);
    return got.includes(want) || want.includes(got);
  });
}

function applyCdnToTopic(topic: TopicDraft & { contents?: PlannedContent[] }, cdn: string) {
  topic.videoUrl = cdn;
  for (const content of topic.contents ?? []) {
    for (const block of content.blocks ?? []) {
      if (block.type === "media" && block.mediaType === "video") {
        block.url = cdn;
      }
    }
  }
}

/**
 * Fix stale drafts: drop cert/intro topics, map CDN URLs from journey by title.
 */
export function repairPlanFromJourney(
  plan: CoursePlan,
  journey: CourseJourney
): string[] {
  const warnings: string[] = [];
  normalizeJourneyVideos(journey);
  const learnSteps = filterTeachingSteps(journey.steps);

  const kept: typeof plan.topics = [];
  for (let i = 0; i < plan.topics.length; i++) {
    const topic = plan.topics[i]!;
    if (isNonTeachingTopic(topic.title)) {
      warnings.push(`Removed non-teaching topic: ${topic.title}`);
      continue;
    }

    let step =
      findJourneyStepForTopic(topic.title, journey) ?? learnSteps[kept.length];
    const cdn = step ? preferCdnUrl(step) : undefined;

    if (cdn) {
      const hadYt =
        (topic.videoUrl && isYoutubeUrl(topic.videoUrl)) ||
        (topic.contents ?? []).some((c) =>
          c.blocks?.some(
            (b) =>
              b.type === "media" &&
              b.mediaType === "video" &&
              isYoutubeUrl(b.url)
          )
        );
      applyCdnToTopic(topic, cdn);
      if (hadYt) warnings.push(`Set CDN video for: ${topic.title}`);
    } else {
      if (topic.videoUrl && isYoutubeUrl(topic.videoUrl)) {
        delete topic.videoUrl;
        warnings.push(`Cleared YouTube videoUrl for: ${topic.title} (no CDN match)`);
      }
      for (const content of topic.contents ?? []) {
        content.blocks = (content.blocks ?? []).filter((block) => {
          if (
            block.type === "media" &&
            block.mediaType === "video" &&
            isYoutubeUrl(block.url)
          ) {
            warnings.push(
              `${topic.title} / ${content.title}: removed YouTube video block`
            );
            return false;
          }
          return true;
        });
      }
    }
    kept.push(topic);
  }

  plan.topics = kept;
  return warnings;
}

/** Watch/learn steps must have a CDN URL — never YouTube in learner-facing fields */
export function requireCdnUrl(step: JourneyStep): string {
  const url = preferCdnUrl(step);
  if (!url) {
    throw new Error(
      `Step "${step.title}" has no CDN video URL. Rebuild the journey (valid X-API-KEY) so chunks upload to media.letsupgrade.net.`
    );
  }
  return url;
}

/** Fix journey JSON: playUrl = cdnUrl only; strip YouTube fallbacks */
export function normalizeJourneyVideos(journey: CourseJourney): void {
  for (const step of journey.steps) {
    if (step.type === "watch" || step.type === "learn") {
      const cdn = preferCdnUrl(step);
      if (cdn) {
        step.video.cdnUrl = cdn;
        step.video.playUrl = cdn;
      } else if (step.video.playUrl && isYoutubeUrl(step.video.playUrl)) {
        delete step.video.playUrl;
      }
    } else {
      if (step.video.playUrl && isYoutubeUrl(step.video.playUrl)) {
        delete step.video.playUrl;
      }
    }
    delete step.video.youtubeFallback;
  }
}

export function assertPlanUsesCdnOnly(plan: CoursePlan): void {
  const bad: string[] = [];
  for (const topic of plan.topics) {
    if (topic.videoUrl && isYoutubeUrl(topic.videoUrl)) {
      bad.push(`${topic.title}: topic videoUrl`);
    }
    for (const content of topic.contents ?? []) {
      for (const block of content.blocks ?? []) {
        if (
          block.type === "media" &&
          block.mediaType === "video" &&
          isYoutubeUrl(block.url)
        ) {
          bad.push(`${topic.title} / ${content.title}`);
        }
      }
    }
  }
  if (bad.length > 0) {
    throw new Error(
      `Course still has YouTube video URLs (${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}). Regenerate course from journey after CDN upload.`
    );
  }
}

export function stripYoutubeFromContents(contents: PlannedContent[]): string[] {
  const warnings: string[] = [];
  for (const content of contents) {
    content.blocks = content.blocks.filter((block) => {
      if (
        block.type === "media" &&
        block.mediaType === "video" &&
        isYoutubeUrl(block.url)
      ) {
        warnings.push(
          `${content.title}: removed YouTube video block (CDN required)`
        );
        return false;
      }
      return true;
    });
  }
  return warnings;
}
