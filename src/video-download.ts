import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { extractVideoId, normalizeYoutubeUrl } from "./youtube.js";

const execFileAsync = promisify(execFile);

const VIDEO_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "videos"
);

export interface DownloadedVideo {
  videoId: string;
  url: string;
  title: string;
  filePath: string;
}

export async function ensureYtDlp(): Promise<void> {
  try {
    await execFileAsync("yt-dlp", ["--version"]);
  } catch {
    throw new Error(
      "yt-dlp is required to download bootcamp videos.\nInstall: brew install yt-dlp"
    );
  }
}

/** Download YouTube video as MP4 (best quality up to 720p for reasonable size) */
export async function downloadYoutubeVideo(url: string): Promise<DownloadedVideo> {
  await ensureYtDlp();
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error(`Invalid YouTube URL: ${url}`);

  const canonical = normalizeYoutubeUrl(url);
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  const outTemplate = path.join(VIDEO_DIR, `${videoId}.%(ext)s`);
  const existing = fs
    .readdirSync(VIDEO_DIR)
    .find((f) => f.startsWith(`${videoId}.`) && /\.(mp4|webm|mkv)$/i.test(f));

  if (existing) {
    const filePath = path.join(VIDEO_DIR, existing);
    const title = await fetchTitle(canonical);
    return { videoId, url: canonical, title, filePath };
  }

  await execFileAsync(
    "yt-dlp",
    [
      "-f",
      "bv*[height<=720]+ba/b[height<=720]/best",
      "--merge-output-format",
      "mp4",
      "-o",
      outTemplate,
      "--no-playlist",
      canonical,
    ],
    { maxBuffer: 1024 * 1024 * 50, timeout: 600_000 }
  );

  const downloaded = fs
    .readdirSync(VIDEO_DIR)
    .find((f) => f.startsWith(`${videoId}.`) && /\.(mp4|webm|mkv)$/i.test(f));

  if (!downloaded) {
    throw new Error(`Download finished but no file found for ${videoId}`);
  }

  const title = await fetchTitle(canonical);
  return {
    videoId,
    url: canonical,
    title,
    filePath: path.join(VIDEO_DIR, downloaded),
  };
}

async function fetchTitle(url: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      ["--print", "title", "--no-download", url],
      { maxBuffer: 1024 * 1024 }
    );
    return stdout.trim();
  } catch {
    return extractVideoId(url) ?? "Video";
  }
}
