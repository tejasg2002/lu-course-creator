import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import { config } from "./config.js";
import type { SessionLogger } from "./logger.js";
import type { CoursePlan, TopicDraft } from "./types.js";

const SYSTEM_PROMPT = `You are an expert instructional designer for LetsUpgrade learning modules.
Submit the complete course plan using the submit_course_plan tool.

Each topic becomes 5 admin UI lessons (built automatically). You only provide the TEXT content fields below.

Per topic provide:
- title: chapter name (plain text, no emoji)
- introText: welcome paragraph for the introduction lesson
- learnItems: exactly 4 bullet strings for "What You Will Learn"
- whyText: paragraph for "Why This Matters"
- whyBullets: exactly 2 short bullet strings (industry value, foundation)
- deepDiveContent: main teaching paragraph
- takeawaysContent: key takeaways paragraph
- concepts: exactly 3 objects { title, content } for Key Concepts lesson
- faqs: exactly 2 objects { question, answer }
- questions: 3-4 MCQs for the question bank (options: exactly 4 strings, correctAnswer must match one)

Rules:
- 3 to 5 topics unless the user asks otherwise
- Plain text in paragraphs (no HTML tags)
- module.tags MUST be []
- Accurate, beginner-friendly unless another level is specified`;

const COURSE_PLAN_TOOL: Anthropic.Tool = {
  name: "submit_course_plan",
  description: "Submit the complete LetsUpgrade module course plan",
  input_schema: {
    type: "object",
    properties: {
      module: {
        type: "object",
        properties: {
          title: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "tags"],
      },
      topics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            introText: { type: "string" },
            learnItems: { type: "array", items: { type: "string" } },
            whyText: { type: "string" },
            whyBullets: { type: "array", items: { type: "string" } },
            deepDiveContent: { type: "string" },
            takeawaysContent: { type: "string" },
            concepts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                },
                required: ["title", "content"],
              },
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
            },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                  },
                  correctAnswer: { type: "string" },
                  explanation: { type: "string" },
                  difficulty: {
                    type: "string",
                    enum: ["easy", "medium", "hard"],
                  },
                },
                required: [
                  "question",
                  "options",
                  "correctAnswer",
                  "difficulty",
                ],
              },
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
      },
    },
    required: ["module", "topics"],
  },
};

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function parsePlanFromText(text: string): CoursePlan {
  const raw = extractJson(text);
  const attempts = [raw, jsonrepair(raw)];
  let lastError: Error | undefined;
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as CoursePlan;
    } catch (e) {
      lastError = e as Error;
    }
  }
  throw lastError ?? new Error("JSON parse failed");
}

function planFromResponse(response: Anthropic.Message): CoursePlan {
  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (toolBlock && toolBlock.type === "tool_use") {
    return toolBlock.input as CoursePlan;
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (textBlock && textBlock.type === "text") {
    return parsePlanFromText(textBlock.text);
  }
  throw new Error("Claude returned no course plan (no tool_use or text)");
}

function validatePlan(plan: CoursePlan): void {
  if (!plan.module?.title?.trim()) {
    throw new Error("AI plan missing module.title");
  }
  if (!Array.isArray(plan.topics) || plan.topics.length === 0) {
    throw new Error("AI plan must include at least one topic");
  }
  if (!Array.isArray(plan.module.tags)) {
    plan.module.tags = [];
  }
  for (const topic of plan.topics) {
    if (!topic.title?.trim()) throw new Error("Topic missing title");
    if (!topic.introText?.trim()) throw new Error(`Topic "${topic.title}" missing introText`);
    for (const q of topic.questions ?? []) {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error(`Question must have 4 options: ${q.question}`);
      }
      if (!q.options.includes(q.correctAnswer)) {
        throw new Error(`correctAnswer must match an option: ${q.question}`);
      }
    }
  }
}

export async function generateCoursePlan(
  prompt: string,
  options?: {
    topicCount?: number;
    level?: string;
    logger?: SessionLogger;
  }
): Promise<CoursePlan> {
  const client = new Anthropic({ apiKey: config.anthropicKey() });
  const logger = options?.logger;

  let userMessage = `Create a LetsUpgrade learning module for:\n\n${prompt}`;
  if (options?.topicCount) {
    userMessage += `\n\nUse exactly ${options.topicCount} topics.`;
  }
  if (options?.level) {
    userMessage += `\n\nTarget audience level: ${options.level}.`;
  }

  const maxAttempts = 2;
  let lastErr: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const compact =
      attempt > 1
        ? "\n\nPrevious response was invalid. Submit a smaller plan with 3 topics."
        : "";

    try {
      logger?.info("Claude request", { attempt, model: config.claudeModel });

      const response = await client.messages.create({
        model: config.claudeModel,
        max_tokens: 16384,
        system: SYSTEM_PROMPT,
        tools: [COURSE_PLAN_TOOL],
        tool_choice: { type: "tool", name: "submit_course_plan" },
        messages: [{ role: "user", content: userMessage + compact }],
      });

      const plan = planFromResponse(response);
      validatePlan(plan);
      logger?.info("Claude plan parsed", {
        attempt,
        stopReason: response.stop_reason,
        moduleTitle: plan.module.title,
        topics: plan.topics.length,
      });
      return plan;
    } catch (err) {
      lastErr = err as Error;
      logger?.error(`Claude attempt ${attempt} failed`, err);
    }
  }

  throw new Error(
    `Failed to generate course plan: ${lastErr?.message ?? "unknown error"}`
  );
}
