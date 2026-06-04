import type { TranscriptSegment } from "./youtube.js";

const MIN_BODY_CHARS = 80;
const PAD_STEP_MS = 60_000;
const MAX_PAD_MS = 12 * 60_000;

export function transcriptBodyLength(transcript: string): number {
  return transcript.replace(/^\[[\d:]+\]\s*/gm, "").trim().length;
}

export function sliceTranscript(
  segments: TranscriptSegment[],
  startMs: number,
  endMs: number
): TranscriptSegment[] {
  return segments.filter((s) => s.startMs < endMs && s.startMs >= startMs);
}

/** Widen [startMs, endMs] until the slice has enough spoken content */
export function sliceTranscriptWithPadding(
  segments: TranscriptSegment[],
  startMs: number,
  endMs: number,
  minBodyChars = MIN_BODY_CHARS
): { startMs: number; endMs: number; text: string } {
  let pad = 0;
  let best = { startMs, endMs, text: "" };

  while (pad <= MAX_PAD_MS) {
    const lo = Math.max(0, startMs - pad);
    const hi = endMs + pad;
    const text = segmentsToTimedText(sliceTranscript(segments, lo, hi));
    if (transcriptBodyLength(text) >= minBodyChars) {
      return { startMs: lo, endMs: hi, text };
    }
    if (transcriptBodyLength(text) > transcriptBodyLength(best.text)) {
      best = { startMs: lo, endMs: hi, text };
    }
    pad += PAD_STEP_MS;
  }

  return best;
}

export function segmentsToTimedText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatMs(s.startMs)}] ${s.text}`)
    .join("\n");
}

export function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Compress long videos for topic-detection (keep timestamps) */
export function condenseForSegmentation(
  segments: TranscriptSegment[],
  windowMs = 45_000
): string {
  if (segments.length === 0) return "";

  const lines: string[] = [];
  let windowStart = segments[0].startMs;
  let buf: string[] = [];

  const flush = (endMs: number) => {
    if (buf.length === 0) return;
    lines.push(`[${formatMs(windowStart)} – ${formatMs(endMs)}] ${buf.join(" ")}`);
    buf = [];
  };

  for (const seg of segments) {
    if (seg.startMs - windowStart >= windowMs && buf.length > 0) {
      flush(seg.startMs);
      windowStart = seg.startMs;
    }
    buf.push(seg.text);
  }
  if (buf.length > 0) {
    flush(segments[segments.length - 1].startMs + 5000);
  }

  return lines.join("\n");
}
