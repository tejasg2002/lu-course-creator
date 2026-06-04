import type { JourneyStep } from "./journey-types.js";
import { transcriptForStep } from "./journey-store.js";
import {
  formatMs,
  sliceTranscriptWithPadding,
  transcriptBodyLength,
} from "./transcript-slice.js";
import { trimTranscriptBleed } from "./topic-scope.js";
import { fetchVideoTranscript } from "./youtube.js";

const MIN_BODY_CHARS = 80;

const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "for",
  "from",
  "into",
  "that",
  "this",
  "your",
  "using",
  "design",
  "covers",
  "demonstrates",
  "shows",
  "explains",
]);

function keywordsFromTopic(title: string, summary: string): string[] {
  const words =
    `${title} ${summary}`
      .toLowerCase()
      .match(/\b[a-z]{4,}\b/g) ?? [];
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))].slice(0, 14);
}

/** Pull lines from a sibling step that match this topic (mis-segmented windows) */
export function borrowTranscriptFromText(
  sourceTranscript: string,
  topicTitle: string,
  summary: string,
  minBodyChars = MIN_BODY_CHARS
): string | null {
  const keywords = keywordsFromTopic(topicTitle, summary);
  if (!keywords.length || !sourceTranscript.trim()) return null;

  const lines = sourceTranscript.split("\n");
  const hitIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i]!.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) hitIndices.push(i);
  }
  if (hitIndices.length === 0) return null;

  const start = Math.max(0, hitIndices[0]! - 4);
  const end = Math.min(lines.length, hitIndices[hitIndices.length - 1]! + 5);
  const excerpt = lines.slice(start, end).join("\n");
  return transcriptBodyLength(excerpt) >= minBodyChars ? excerpt : null;
}

/** Last-resort transcript so course generation never dies on sparse captions */
export function ensureUsableTranscript(
  transcript: string,
  topicTitle: string,
  topicSummary?: string,
  timeLabel?: string
): string {
  if (transcriptBodyLength(transcript) >= MIN_BODY_CHARS) return transcript;

  const scope = (topicSummary ?? "").trim();
  if (scope.length >= MIN_BODY_CHARS) {
    const stamp = timeLabel ? `[${timeLabel}] ` : "";
    return `${stamp}${scope}`;
  }
  if (scope.length > 0) {
    return `Topic: ${topicTitle}\n\n${scope}`;
  }

  throw new Error(
    `Transcript too short for "${topicTitle}" — rebuild journey or widen topic segment.`
  );
}

/**
 * Ensure a journey step has enough transcript for AI course generation.
 * Handles empty slices when segment times fall on music/silence.
 */
export async function recoverTranscriptForStep(
  step: JourneyStep,
  opts: { learnSteps: JourneyStep[]; stepIndex: number; courseId?: string }
): Promise<string> {
  const { courseId } = opts;
  let text = trimTranscriptBleed(transcriptForStep(step, courseId));
  if (transcriptBodyLength(text) >= MIN_BODY_CHARS) return text;

  for (let j = opts.stepIndex - 1; j >= 0; j--) {
    const prev = opts.learnSteps[j]!;
    if (prev.video.videoId !== step.video.videoId) break;
    const borrowed = borrowTranscriptFromText(
      transcriptForStep(prev, courseId),
      step.title,
      step.summary || step.description
    );
    if (borrowed) return borrowed;
  }

  const url = step.video.sourceUrl?.trim();
  if (url && step.startMs != null && step.endMs != null) {
    try {
      const full = await fetchVideoTranscript(url);
      const padded = sliceTranscriptWithPadding(
        full.segments,
        step.startMs,
        step.endMs
      );
      text = trimTranscriptBleed(padded.text);
      if (transcriptBodyLength(text) >= MIN_BODY_CHARS) return text;
    } catch {
      /* fall through to summary */
    }
  }

  const scope = (step.summary || step.description || "").trim();
  if (scope.length >= MIN_BODY_CHARS) {
    return `[${formatMs(step.startMs)}] Timed captions are sparse in the assigned segment window; use the segment scope and adjacent teaching from the same video.\n[${formatMs(step.startMs)}] ${scope}`;
  }

  return ensureUsableTranscript(text, step.title, scope, step.timeLabel);
}
