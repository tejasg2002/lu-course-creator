import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { YoutubeTranscript } from "youtube-transcript";

const execFileAsync = promisify(execFile);

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "youtube"
);

export interface TranscriptSegment {
  startMs: number;
  text: string;
}

export interface VideoTranscript {
  videoId: string;
  url: string;
  title: string;
  text: string;
  segments: TranscriptSegment[];
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const m = url.trim().match(re);
    if (m) return m[1];
  }
  return null;
}

export function normalizeYoutubeUrl(url: string): string {
  const id = extractVideoId(url);
  if (!id) throw new Error(`Invalid YouTube URL: ${url}`);
  return `https://www.youtube.com/watch?v=${id}`;
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (res.ok) {
      const data = (await res.json()) as { title?: string };
      if (data.title) return data.title;
    }
  } catch {
    /* use videoId as fallback */
  }
  return videoId;
}

async function fetchViaNpm(videoId: string): Promise<TranscriptSegment[]> {
  const lines = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: "en",
  });
  return lines
    .map((line) => ({
      startMs: Math.round(line.offset),
      text: line.text.replace(/\s+/g, " ").trim(),
    }))
    .filter((s) => s.text.length > 0);
}

function parseVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = vtt.split(/\n\n+/);
  const timeRe =
    /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const timeLine = lines.find((l) => timeRe.test(l));
    if (!timeLine) continue;
    const m = timeLine.match(timeRe);
    if (!m) continue;
    const startMs =
      Number(m[1]) * 3_600_000 +
      Number(m[2]) * 60_000 +
      Number(m[3]) * 1000 +
      Number(m[4]);
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) segments.push({ startMs, text });
  }
  return segments;
}

function isYtDlpMissing(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  return e?.code === "ENOENT" || String(e?.message ?? err).includes("ENOENT");
}

async function fetchViaYtDlp(
  videoId: string,
  canonical: string
): Promise<TranscriptSegment[]> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const outBase = path.join(DATA_DIR, videoId);

  await execFileAsync(
    "yt-dlp",
    [
      "--skip-download",
      "--write-auto-sub",
      "--write-sub",
      "--sub-lang",
      "en.*,en",
      "--convert-subs",
      "vtt",
      "-o",
      `${outBase}.%(ext)s`,
      canonical,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith(videoId) && f.endsWith(".vtt"));
  if (files.length === 0) {
    throw new Error(`No subtitles file for ${videoId}`);
  }

  const vtt = fs.readFileSync(path.join(DATA_DIR, files[0]), "utf8");
  return parseVtt(vtt);
}

/** Fetch title + subtitles (npm first; yt-dlp optional fallback) */
export async function fetchVideoTranscript(
  url: string
): Promise<VideoTranscript> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error(`Invalid YouTube URL: ${url}`);

  const canonical = normalizeYoutubeUrl(url);
  const title = await fetchVideoTitle(videoId);

  let segments: TranscriptSegment[] = [];

  try {
    segments = await fetchViaNpm(videoId);
  } catch (npmErr) {
    try {
      segments = await fetchViaYtDlp(videoId, canonical);
    } catch (dlpErr) {
      if (isYtDlpMissing(dlpErr)) {
        throw new Error(
          `Could not fetch captions for ${videoId}. ` +
            `NPM: ${(npmErr as Error).message}. ` +
            `Enable English captions on the video, or install yt-dlp: brew install yt-dlp`
        );
      }
      throw dlpErr;
    }
  }

  if (segments.length === 0) {
    throw new Error(
      `No transcript lines for ${videoId}. Enable captions on YouTube.`
    );
  }

  const text = segments.map((s) => s.text).join(" ");
  return { videoId, url: canonical, title, text, segments };
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  maxChars = 12_000
): string[] {
  const chunks: string[] = [];
  let buf = "";

  for (const seg of segments) {
    const line = `[${formatTime(seg.startMs)}] ${seg.text}\n`;
    if (buf.length + line.length > maxChars && buf.length > 0) {
      chunks.push(buf.trim());
      buf = line;
    } else {
      buf += line;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length > 0 ? chunks : [""];
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return [h, m % 60, s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
