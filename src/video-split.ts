import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { TopicSegment } from "./topic-segmentation.js";
import { formatMs } from "./transcript-slice.js";

const execFileAsync = promisify(execFile);

const CHUNKS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "chunks"
);

export interface VideoChunk {
  segment: TopicSegment;
  filePath: string;
}

export async function ensureFfmpeg(): Promise<void> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
  } catch {
    throw new Error(
      "ffmpeg is required to split videos by topic.\nInstall: brew install ffmpeg"
    );
  }
}

function safeName(title: string, index: number): string {
  return `${String(index + 1).padStart(2, "0")}_${title
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60)}`;
}

/** Cut video file into one MP4 per topic segment */
export async function splitVideoByTopics(
  videoPath: string,
  videoId: string,
  segments: TopicSegment[]
): Promise<VideoChunk[]> {
  await ensureFfmpeg();
  const outDir = path.join(CHUNKS_DIR, videoId);
  fs.mkdirSync(outDir, { recursive: true });

  const chunks: VideoChunk[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const base = safeName(seg.title, i);
    const outPath = path.join(outDir, `${base}.mp4`);
    const start = formatMs(seg.startMs);
    const end = formatMs(seg.endMs);

    if (fs.existsSync(outPath)) {
      chunks.push({ segment: seg, filePath: outPath });
      continue;
    }

    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        videoPath,
        "-ss",
        start,
        "-to",
        end,
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        outPath,
      ],
      { maxBuffer: 1024 * 1024 * 10, timeout: 600_000 }
    );

    chunks.push({ segment: seg, filePath: outPath });
  }

  return chunks;
}

export function youtubeUrlAtTime(videoUrl: string, startMs: number): string {
  const sec = Math.floor(startMs / 1000);
  const sep = videoUrl.includes("?") ? "&" : "?";
  return `${videoUrl}${sep}t=${sec}`;
}
