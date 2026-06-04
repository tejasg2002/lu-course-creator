import { buildCourseFromJourney } from "./course-from-journey.js";
import { buildCourseJourney } from "./journey-builder.js";
import { saveJourney } from "./journey-store.js";
import { prepareCoursePlan } from "./sanitize.js";
import { saveDraft } from "./draft-store.js";
import type { CourseJourney } from "./journey-types.js";
import type { CoursePlan } from "./types.js";
import { extractVideoId, normalizeYoutubeUrl } from "./youtube.js";

export const DEFAULT_BOOTCAMP_URLS = [
  "https://youtu.be/xZ5sa-FF7Es",
  "https://youtu.be/stDmKC5OkrM",
  "https://www.youtube.com/watch?v=stDmKC5OkrM",
];

export function parseBootcampUrls(urls: string[]) {
  const seen = new Set<string>();
  const inputs: { url: string; dayLabel: string }[] = [];

  for (const url of urls) {
    const id = extractVideoId(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    inputs.push({
      url: normalizeYoutubeUrl(url),
      dayLabel: `Day ${inputs.length + 1}`,
    });
  }
  return inputs;
}

/** Legacy one-shot: journey + course in one call */
export async function generateBootcampPlan(opts: {
  urls?: string[];
  moduleTitle?: string;
  uploadChunks?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<CoursePlan> {
  const urls = opts.urls?.length ? opts.urls : DEFAULT_BOOTCAMP_URLS;
  const journey = await buildCourseJourney({
    courseName: opts.moduleTitle ?? "Bootcamp Course",
    urls,
    uploadChunksToCdn: opts.uploadChunks !== false,
    onProgress: opts.onProgress,
  });
  saveJourney(journey);
  const plan = await buildCourseFromJourney(journey, {
    onProgress: opts.onProgress,
  });
  return plan;
}

export { buildCourseJourney, buildCourseFromJourney };
export type { CourseJourney };
