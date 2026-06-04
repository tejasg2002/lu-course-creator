import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { formatMs } from "./transcript-slice.js";

export interface TopicSegment {
  title: string;
  startMs: number;
  endMs: number;
  summary: string;
}

const SEGMENT_TOOL: Anthropic.Tool = {
  name: "submit_topic_segments",
  description: "Submit logical topic segments from a bootcamp video transcript",
  input_schema: {
    type: "object",
    properties: {
      videoTitle: { type: "string" },
      topics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            startMs: { type: "number" },
            endMs: { type: "number" },
            summary: { type: "string" },
          },
          required: ["title", "startMs", "endMs", "summary"],
        },
      },
    },
    required: ["topics"],
  },
};

function parseTimeToMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const s = String(value ?? "").trim();
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(":").map(Number);
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  return 0;
}

export async function detectTopicSegments(opts: {
  videoTitle: string;
  condensedTranscript: string;
  durationMs: number;
  maxTopics?: number;
}): Promise<TopicSegment[]> {
  const client = new Anthropic({ apiKey: config.anthropicKey() });
  const maxTopics = opts.maxTopics ?? 8;

  const response = await client.messages.create({
    model: config.claudeModel,
    max_tokens: 4096,
    system: `You segment bootcamp lecture transcripts into sequential TEACHING topics only.

Each segment must:
- Title = specific subject taught in that window (e.g. "Excel Interface and Ribbon", "SUM and Basic Formulas") — never "Part 1" or "Introduction"
- summary = 1-2 sentences listing ONLY what the instructor teaches in that window (use their vocabulary)
- startMs / endMs in milliseconds, contiguous, no overlap; endMs of one ≈ startMs of next
- 3 to ${maxTopics} segments; each segment at least 2 minutes of teaching when possible
- FIRST segment starts when hands-on teaching begins (not cert/attendance/trainer bio)
- SKIP entirely: certificate, attendance, assignments, bootcamp admin, long trainer introductions
- Do not merge unrelated subjects; one main topic per segment`,
    tools: [SEGMENT_TOOL],
    tool_choice: { type: "tool", name: "submit_topic_segments" },
    messages: [
      {
        role: "user",
        content: `Video: ${opts.videoTitle}
Approximate duration: ${formatMs(opts.durationMs)}

Segment this transcript into ${maxTopics} or fewer logical topics. Return startMs and endMs in milliseconds.

Transcript (time-windowed):
${opts.condensedTranscript.slice(0, 60_000)}`,
      },
    ],
  });

  const tool = response.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Failed to detect topic segments");
  }

  const raw = tool.input as { topics: Array<Record<string, unknown>> };
  const topics = (raw.topics ?? []).map((t) => ({
    title: String(t.title ?? "Topic").trim(),
    startMs: parseTimeToMs(t.startMs),
    endMs: parseTimeToMs(t.endMs),
    summary: String(t.summary ?? "").trim(),
  }));

  if (topics.length === 0) {
    throw new Error("No topic segments detected");
  }

  topics.sort((a, b) => a.startMs - b.startMs);
  topics[0].startMs = Math.max(0, topics[0].startMs);
  topics[topics.length - 1].endMs = Math.max(
    topics[topics.length - 1].endMs,
    topics[topics.length - 1].startMs + 60_000
  );

  return topics;
}
