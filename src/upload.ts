import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export class UploadError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export type UploadResource = "modules" | "contents" | string;

export interface UploadResult {
  url: string;
  raw: unknown;
}

function extractUrl(body: Record<string, unknown>): string | null {
  const results = body.results;
  const resultObj =
    results && typeof results === "object" && !Array.isArray(results)
      ? (results as Record<string, unknown>)
      : undefined;

  const candidates: unknown[] = [
    body.url,
    body.link,
    body.fileUrl,
    body.file_url,
    body.Location,
    body.location,
    resultObj?.url,
    resultObj?.link,
    resultObj?.fileUrl,
    resultObj?.file_url,
    resultObj?.cdnUrl,
    resultObj?.cdn_url,
    resultObj?.path,
    (body.data as Record<string, unknown> | undefined)?.url,
    (body.data as Record<string, unknown> | undefined)?.fileUrl,
    (body.result as Record<string, unknown> | undefined)?.url,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//.test(c)) return c;
  }
  return null;
}

/** Upload a split topic video chunk to LU CDN (resource: contents) */
export async function uploadVideoChunk(filePath: string): Promise<string> {
  const { url } = await uploadFileFromPath(filePath, "contents");
  return url;
}

/**
 * Upload a file to LetsUpgrade CDN.
 * POST https://service.letsupgrade.in/v4/upload/file
 */
export async function uploadFileToCdn(
  file: Buffer | Blob,
  filename: string,
  options?: {
    resource?: UploadResource;
    mimeType?: string;
  }
): Promise<UploadResult> {
  const resource = options?.resource ?? "modules";
  const mimeType =
    options?.mimeType ?? mimeFromFilename(filename) ?? "application/octet-stream";

  const form = new FormData();
  const blob =
    file instanceof Blob ? file : new Blob([file], { type: mimeType });
  form.append("file", blob, filename);
  form.append("resource", resource);

  const res = await fetch(config.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.luToken()}`,
    },
    body: form,
  });

  const rawText = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    if (!res.ok) {
      throw new UploadError(
        `Upload failed (${res.status}): ${rawText.slice(0, 200)}`,
        res.status
      );
    }
  }

  if (!res.ok || body.error === true) {
    const msg =
      (typeof body.message === "string" && body.message) ||
      (typeof body.error === "string" && body.error) ||
      `Upload failed (${res.status})`;
    const hint =
      res.status === 401 ||
      /unauthor/i.test(msg)
        ? " Refresh X-API-KEY in .env (copy JWT from LU admin login) and restart the dev server."
        : "";
    throw new UploadError(msg + hint, res.status);
  }

  const url = extractUrl(body);
  if (!url) {
    throw new UploadError(
      `Upload succeeded but no URL in response: ${rawText.slice(0, 300)}`,
      res.status
    );
  }

  return { url, raw: body };
}

/** Upload from a path on disk */
export async function uploadFileFromPath(
  filePath: string,
  resource: UploadResource = "modules"
): Promise<UploadResult> {
  const abs = path.resolve(filePath);
  const buffer = fs.readFileSync(abs);
  return uploadFileToCdn(buffer, path.basename(abs), {
    resource,
    mimeType: mimeFromFilename(abs) ?? undefined,
  });
}

function mimeFromFilename(name: string): string | null {
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".pdf": "application/pdf",
  };
  return map[ext] ?? null;
}
