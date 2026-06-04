import { config } from "./config.js";
import { filterObjectIds } from "./sanitize.js";
import type { ApiResponse, ContentBlock, PlannedQuestion } from "./types.js";

export type ApiLogFn = (
  method: string,
  path: string,
  status: number,
  detail?: string
) => void;

let apiLog: ApiLogFn | undefined;

export function setApiLogger(fn: ApiLogFn | undefined) {
  apiLog = fn;
}

export class LuApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "LuApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${config.luBaseUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.luToken()}`,
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...options, headers });
  const raw = await res.text();
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const hint =
      raw.trimStart().startsWith("<!DOCTYPE") || raw.includes("<html")
        ? " Got HTML — check BASE_URL points to the admin API host (not a 404 page)."
        : "";
    throw new LuApiError(
      `Non-JSON response (${res.status}) from ${url}.${hint}`,
      res.status
    );
  }

  let body: ApiResponse<T> & { id?: string };
  try {
    body = JSON.parse(raw) as ApiResponse<T> & { id?: string };
  } catch {
    throw new LuApiError(`Invalid JSON from ${url}`, res.status);
  }

  if (!res.ok || !body.success) {
    const err =
      "error" in body && body.error
        ? body.error
        : `Request failed (${res.status})`;
    apiLog?.(options.method ?? "GET", path, res.status, err);
    throw new LuApiError(err, res.status);
  }

  apiLog?.(options.method ?? "GET", path, res.status, "ok");
  return body as T;
}

export async function createModule(
  title: string,
  tags: string[] = [],
  thumbnail?: string
) {
  const validTags = filterObjectIds(tags);
  const body: Record<string, unknown> = { title };
  if (validTags.length > 0) body.tags = validTags;
  if (thumbnail?.trim()) body.thumbnail = thumbnail.trim();

  const result = await request<{ id: string }>("/modules", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const id = (result as { id?: string }).id;
  if (!id) throw new LuApiError("Module created but no id returned");
  return id;
}

export async function createTopic(moduleId: string, title: string) {
  const result = await request<{ id: string }>(
    `/modules/${moduleId}/topics`,
    {
      method: "POST",
      body: JSON.stringify({ title }),
    }
  );
  const id = (result as { id?: string }).id;
  if (!id) throw new LuApiError("Topic created but no id returned");
  return id;
}

export async function createContent(
  moduleId: string,
  topicId: string,
  payload: {
    title: string;
    description?: string;
    color?: string | null;
    duration?: number;
    blocks: ContentBlock[];
    priority?: number;
  }
) {
  const body: Record<string, unknown> = {
    title: payload.title,
    blocks: payload.blocks,
    priority: payload.priority ?? 0,
  };
  if (payload.description) body.description = payload.description;
  if (payload.color !== undefined) body.color = payload.color;
  if (payload.duration !== undefined) body.duration = payload.duration;

  const result = await request<{ id: string }>(
    `/modules/${moduleId}/topics/${topicId}/contents`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  const id = (result as { id?: string }).id;
  if (!id) throw new LuApiError("Content created but no id returned");
  return id;
}

export async function bulkCreateQuestions(
  moduleId: string,
  topicId: string,
  questions: PlannedQuestion[]
) {
  if (questions.length === 0) return 0;
  await request<unknown>(
    `/modules/${moduleId}/topics/${topicId}/questions/bulk`,
    {
      method: "POST",
      body: JSON.stringify({
        questions: questions.map((q) => ({
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          difficulty: q.difficulty,
        })),
      }),
    }
  );
  return questions.length;
}
