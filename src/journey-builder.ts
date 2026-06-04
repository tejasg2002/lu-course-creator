import { detectTopicSegments } from "./topic-segmentation.js";
import type { CourseJourney } from "./journey-types.js";
import { polishJourneyNarrative } from "./journey-narrative.js";
import {
  condenseForSegmentation,
  sliceTranscriptWithPadding,
} from "./transcript-slice.js";
import { downloadYoutubeVideo } from "./video-download.js";
import { splitVideoByTopics } from "./video-split.js";
import { uploadVideoChunk } from "./upload.js";
import { parseBootcampUrls } from "./bootcamp.js";
import { normalizeJourneyVideos } from "./cdn-video.js";
import { isNonTeachingTopic, trimTranscriptBleed } from "./topic-scope.js";
import { fetchVideoTranscript } from "./youtube.js";

export type ProgressCallback = (message: string, progress?: number) => void;

function formatRange(startMs: number, endMs: number): string {
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return h > 0
      ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
      : `${m}:${String(s % 60).padStart(2, "0")}`;
  };
  return `${fmt(startMs)} – ${fmt(endMs)}`;
}

/**
 * Step 1–2 of user flow: download videos, transcript, build journey JSON
 */
export async function buildCourseJourney(opts: {
  courseName: string;
  urls: string[];
  /** Upload each split chunk to LU CDN (required; default: true) */
  uploadChunksToCdn?: boolean;
  onProgress?: ProgressCallback;
}): Promise<CourseJourney> {
  const report = opts.onProgress ?? (() => {});
  if (opts.uploadChunksToCdn === false) {
    throw new Error(
      "CDN upload is required. Course videos must use media.letsupgrade.net, not YouTube links."
    );
  }

  const inputs = parseBootcampUrls(opts.urls);
  if (inputs.length === 0) {
    throw new Error("Add at least one valid YouTube URL");
  }

  const journey: CourseJourney = {
    courseName: opts.courseName.trim() || "Bootcamp Course",
    createdAt: new Date().toISOString(),
    journeyIntro: "",
    sources: [],
    steps: [],
  };

  let order = 0;
  const videoCount = inputs.length;

  for (let vi = 0; vi < videoCount; vi++) {
    const input = inputs[vi]!;
    const videoBase = (vi / videoCount) * 88;
    const videoSpan = 88 / videoCount;

    report(`${input.dayLabel}: starting`, videoBase + 2);

    report(`Downloading video (${input.dayLabel})…`, videoBase + videoSpan * 0.1);
    const downloaded = await downloadYoutubeVideo(input.url);
    report(`Downloaded ${downloaded.videoId}`, videoBase + videoSpan * 0.18);

    report("Fetching transcript…", videoBase + videoSpan * 0.25);
    const transcript = await fetchVideoTranscript(input.url);
    const durationMs =
      (transcript.segments.at(-1)?.startMs ?? 0) + 10_000;

    journey.sources.push({
      url: downloaded.url,
      videoId: downloaded.videoId,
      title: downloaded.title,
      localPath: downloaded.filePath,
      durationMs,
      dayLabel: input.dayLabel,
    });

    order++;
    journey.steps.push({
      order,
      stepId: `milestone-${downloaded.videoId}`,
      type: "milestone",
      phase: input.dayLabel,
      title: `${input.dayLabel}: ${downloaded.title}`,
      description: `Start of ${input.dayLabel} — watch and learn the topics below in order.`,
      summary: `Session: ${downloaded.title}`,
      startMs: 0,
      endMs: 0,
      timeLabel: "Start",
      video: {
        sourceUrl: downloaded.url,
        videoId: downloaded.videoId,
        videoTitle: downloaded.title,
      },
      transcript: "",
    });

    report("AI: detecting topics from transcript…", videoBase + videoSpan * 0.32);
    const segments = await detectTopicSegments({
      videoTitle: downloaded.title,
      condensedTranscript: condenseForSegmentation(transcript.segments),
      durationMs,
    });
    const teachingSegments = segments.filter(
      (s) => !isNonTeachingTopic(s.title, s.summary)
    );
    const skippedSeg = segments.length - teachingSegments.length;
    if (skippedSeg > 0) {
      report(`Skipped ${skippedSeg} non-teaching segment(s)`, videoBase + videoSpan * 0.35);
    }
    report(`${teachingSegments.length} teaching topics found`, videoBase + videoSpan * 0.38);

    if (teachingSegments.length === 0) {
      throw new Error("No teaching topics found in video — check transcript or URL");
    }

    report("Splitting video by topic…", videoBase + videoSpan * 0.42);
    const chunks = await splitVideoByTopics(
      downloaded.filePath,
      downloaded.videoId,
      teachingSegments
    );

    const chunkBase = videoBase + videoSpan * 0.48;
    const chunkSpan = videoSpan * 0.4;

    for (let i = 0; i < chunks.length; i++) {
      const { segment, filePath } = chunks[i]!;
      const sliced = sliceTranscriptWithPadding(
        transcript.segments,
        segment.startMs,
        segment.endMs
      );
      const transcriptText = sliced.text;
      const chunkPct =
        chunkBase + chunkSpan * ((i + 1) / Math.max(chunks.length, 1));

      report(`Uploading to CDN: ${segment.title}`, chunkPct - 2);
      const cdnUrl = await uploadVideoChunk(filePath);
      report(`Uploaded: ${segment.title}`, chunkPct);

      order++;
      journey.steps.push({
        order,
        stepId: `${downloaded.videoId}-topic-${i + 1}`,
        type: "watch",
        phase: input.dayLabel,
        title: segment.title,
        description: segment.summary,
        summary: segment.summary,
        startMs: sliced.startMs,
        endMs: sliced.endMs,
        timeLabel: formatRange(sliced.startMs, sliced.endMs),
        video: {
          sourceUrl: downloaded.url,
          videoId: downloaded.videoId,
          videoTitle: downloaded.title,
          chunkFile: filePath,
          cdnUrl,
          playUrl: cdnUrl,
        },
        transcript: trimTranscriptBleed(transcriptText),
      });
    }
  }

  normalizeJourneyVideos(journey);
  report("Polishing journey narrative…", 92);
  const polished = await polishJourneyNarrative(journey);
  report("Timeline complete", 98);
  return polished;
}
