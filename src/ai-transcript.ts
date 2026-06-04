import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { TopicDraft } from "./types.js";
import { cleanTopicDraft } from "./video-fidelity.js";
import { ensureUsableTranscript } from "./step-transcript.js";

const TOPIC_TOOL: Anthropic.Tool = {
  name: "submit_topic_draft",
  description:
    "Submit lesson content derived ONLY from the provided video transcript segment",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Must match the topic title exactly",
      },
      introText: {
        type: "string",
        description:
          "2-3 sentences: what the instructor teaches in THIS clip (mention tools, menus, shortcuts by name)",
      },
      learnItems: {
        type: "array",
        items: { type: "string" },
        description:
          "Exactly 4 bullets: specific skills/steps/demo items said in the video (not generic goals)",
      },
      whyText: {
        type: "string",
        description:
          "Why this matters — only reasons the instructor gives in this segment",
      },
      whyBullets: {
        type: "array",
        items: { type: "string" },
        description: "2 bullets with concrete benefits/examples from the video",
      },
      deepDiveContent: {
        type: "string",
        description:
          "Detailed notes (4-8 short paragraphs): walk through what is taught step-by-step as in the lecture; include Excel/UI terms, shortcuts, formulas, examples spoken by instructor",
      },
      takeawaysContent: {
        type: "string",
        description: "3-5 sentences summarizing actions learner should remember from this clip",
      },
      concepts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Name of one idea from the video (e.g. 'Ctrl+Arrow navigation')",
            },
            content: {
              type: "string",
              description: "Explain that idea using only what the instructor said",
            },
          },
          required: ["title", "content"],
        },
        description: "2-3 key ideas demonstrated in this segment",
      },
      faqs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: { type: "string" },
          },
          required: ["question", "answer"],
        },
        description: "2 FAQs a student might ask about THIS clip; answers from transcript only",
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            correctAnswer: { type: "string" },
            explanation: { type: "string" },
            difficulty: {
              type: "string",
              enum: ["easy", "medium", "hard"],
            },
          },
          required: ["question", "options", "correctAnswer", "difficulty"],
        },
        description:
          "3-4 quiz questions testing facts/steps explicitly stated in this transcript",
      },
    },
    required: [
      "title",
      "introText",
      "learnItems",
      "whyText",
      "whyBullets",
      "deepDiveContent",
      "takeawaysContent",
      "concepts",
      "faqs",
      "questions",
    ],
  },
};

const SYSTEM_PROMPT = `You are an instructional designer creating LetsUpgrade course lessons from a SINGLE video transcript segment.

Your job is to make the written course feel like notes taken while watching that exact clip — not a generic tutorial.

STRICT RULES:
1. Use ONLY information from the transcript below. If it is not said or clearly demonstrated, do not include it.
2. Name specific tools, features, shortcuts, formulas, menu paths, and examples exactly as the instructor does.
3. Do NOT write generic bootcamp copy ("industry-relevant", "building blocks", "hands-on practice", "core concepts").
4. Do NOT mention certificates, attendance, assignments, or Let's Upgrade unless that is the entire transcript.
5. Do NOT reference YouTube or URLs in text fields.
6. deepDiveContent is the main lesson — make it rich, sequential, and faithful to the teaching flow in the video.
7. Quiz questions must be answerable from the transcript alone.
8. title must equal the topic title given by the user exactly.`;

export async function generateTopicFromTranscript(opts: {
  dayLabel: string;
  videoTitle: string;
  videoUrl: string;
  transcript: string;
  topicTitle: string;
  topicSummary?: string;
  timeLabel?: string;
}): Promise<TopicDraft> {
  const transcript = ensureUsableTranscript(
    opts.transcript,
    opts.topicTitle,
    opts.topicSummary,
    opts.timeLabel
  );

  const client = new Anthropic({ apiKey: config.anthropicKey() });

  const response = await client.messages.create({
    model: config.claudeModel,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [TOPIC_TOOL],
    tool_choice: { type: "tool", name: "submit_topic_draft" },
    messages: [
      {
        role: "user",
        content: `TOPIC TITLE (use exactly): ${opts.topicTitle}
SESSION: ${opts.dayLabel}
SOURCE VIDEO: ${opts.videoTitle}
${opts.timeLabel ? `SEGMENT TIME: ${opts.timeLabel}` : ""}
${opts.topicSummary ? `SEGMENT SCOPE: ${opts.topicSummary}` : ""}

The learner will watch the CDN video for this segment, then read your text. Everything you write must match that video.

TRANSCRIPT (only source of truth):
${transcript.slice(0, 120_000)}`,
      },
    ],
  });

  const tool = response.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    throw new Error("Claude did not return topic draft");
  }

  const draft = cleanTopicDraft(tool.input as TopicDraft, opts.topicTitle);
  return { ...draft, videoUrl: opts.videoUrl };
}
