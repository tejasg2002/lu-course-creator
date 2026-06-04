import { isLessonColorName } from "./lesson-colors.js";
import { sanitizeBlocks } from "./blocks.js";
import { buildTopicContents } from "./content-template.js";
import { assertPlanUsesCdnOnly } from "./cdn-video.js";
import { isYoutubeUrl } from "./topic-scope.js";
import type { CoursePlan, PlannedContent, TopicDraft } from "./types.js";

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

export function isValidObjectId(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID_RE.test(value);
}

export function filterObjectIds(ids: unknown[] | undefined): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter(isValidObjectId);
}

function applyCdnVideoToContents(
  contents: PlannedContent[],
  videoUrl: string | undefined,
  topicTitle: string
): string[] {
  const warnings: string[] = [];
  if (!videoUrl || isYoutubeUrl(videoUrl)) return warnings;

  for (const content of contents) {
    for (const block of content.blocks) {
      if (block.type !== "media" || block.mediaType !== "video") continue;
      if (isYoutubeUrl(block.url)) {
        warnings.push(
          `${topicTitle} / ${content.title}: replaced YouTube URL with CDN video`
        );
        block.url = videoUrl;
      }
    }
  }
  return warnings;
}

function sanitizeContents(contents: PlannedContent[], topicTitle: string) {
  const warnings: string[] = [];
  for (const content of contents) {
    const ctx = `${topicTitle} / ${content.title}`;
    const lessonColor =
      content.color && isLessonColorName(content.color)
        ? content.color
        : undefined;
    const { blocks, warnings: bw } = sanitizeBlocks(
      content.blocks,
      ctx,
      lessonColor
    );
    content.blocks = blocks;
    if (lessonColor) content.color = lessonColor;
    warnings.push(...bw);
  }
  return warnings;
}

/** Build UI lessons, sanitize tags/blocks for API */
export function prepareCoursePlan(
  plan: CoursePlan,
  opts?: { strict?: boolean }
): {
  plan: CoursePlan & { topics: Array<TopicDraft & { contents: PlannedContent[] }> };
  warnings: string[];
} {
  const warnings: string[] = [];
  const strict = opts?.strict !== false;
  const rawTags = plan.module.tags ?? [];
  const validTags = filterObjectIds(rawTags);
  if (rawTags.length > validTags.length) {
    warnings.push(
      `Dropped ${rawTags.length - validTags.length} invalid module tag(s)`
    );
  }
  plan.module.tags = validTags;

  const topics = plan.topics.map((draft, topicIndex) => {
    const cdn =
      draft.videoUrl && !isYoutubeUrl(draft.videoUrl) ? draft.videoUrl : undefined;
    const contents = buildTopicContents(draft, topicIndex, { strict });
    warnings.push(...applyCdnVideoToContents(contents, cdn, draft.title));
    warnings.push(...sanitizeContents(contents, draft.title));
    if (cdn) draft.videoUrl = cdn;
    return { ...draft, contents };
  });

  return {
    plan: { ...plan, topics },
    warnings,
  };
}
