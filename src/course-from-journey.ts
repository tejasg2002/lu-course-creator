import { generateTopicFromTranscript } from "./ai-transcript.js";
import { normalizeJourneyVideos } from "./cdn-video.js";
import { uploadVideoChunk } from "./upload.js";
import type { CourseJourney } from "./journey-types.js";
import type { CoursePlan, TopicDraft } from "./types.js";
import type { ProgressCallback } from "./journey-builder.js";
import {
  filterTeachingSteps,
  isYoutubeUrl,
  preferCdnUrl,
} from "./topic-scope.js";
import { recoverTranscriptForStep } from "./step-transcript.js";

/**
 * Step 3: journey JSON → full course (CDN video URLs only)
 */
export async function buildCourseFromJourney(
  journey: CourseJourney,
  opts?: {
    onProgress?: ProgressCallback;
    courseId?: string;
  }
): Promise<CoursePlan> {
  const report = opts?.onProgress ?? (() => {});
  normalizeJourneyVideos(journey);

  const topics: TopicDraft[] = [];
  const learnSteps = filterTeachingSteps(journey.steps);
  const skipped = journey.steps.filter(
    (s) =>
      (s.type === "watch" || s.type === "learn") &&
      !learnSteps.includes(s)
  );

  if (skipped.length > 0) {
    report(
      `Skipping ${skipped.length} non-teaching segment(s)`,
      4
    );
  }

  report(`Writing lessons for ${learnSteps.length} topics…`, 8);

  for (let i = 0; i < learnSteps.length; i++) {
    const step = learnSteps[i]!;
    const pct = 10 + Math.round(((i + 1) / learnSteps.length) * 82);
    report(`AI: ${step.title}`, pct);

    let videoUrl = preferCdnUrl(step);

    if (!videoUrl && step.video.chunkFile) {
      report(`Uploading video for ${step.title}…`, pct - 1);
      const cdnUrl = await uploadVideoChunk(step.video.chunkFile);
      step.video.cdnUrl = cdnUrl;
      step.video.playUrl = cdnUrl;
      videoUrl = cdnUrl;
    }

    if (!videoUrl || isYoutubeUrl(videoUrl)) {
      throw new Error(
        `Step "${step.title}" has no CDN URL. Re-run journey build with valid X-API-KEY.`
      );
    }

    const transcript = await recoverTranscriptForStep(step, {
      learnSteps,
      stepIndex: i,
      courseId: opts?.courseId,
    });

    const draft = await generateTopicFromTranscript({
      dayLabel: step.phase,
      videoTitle: step.video.videoTitle,
      videoUrl,
      topicTitle: step.title,
      topicSummary: step.summary || step.description,
      timeLabel: step.timeLabel,
      transcript,
    });

    draft.title = step.title;
    draft.videoUrl = videoUrl;
    topics.push(draft);
  }

  return {
    module: {
      title: journey.courseName,
      tags: [],
    },
    topics,
  };
}

