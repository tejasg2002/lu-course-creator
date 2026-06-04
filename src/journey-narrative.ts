import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { CourseJourney, JourneyStep } from "./journey-types.js";

const NARRATIVE_TOOL: Anthropic.Tool = {
  name: "submit_journey_narrative",
  description: "Polish course journey intro and step descriptions for learner flow",
  input_schema: {
    type: "object",
    properties: {
      journeyIntro: { type: "string" },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            stepId: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            type: { type: "string", enum: ["milestone", "watch", "learn"] },
          },
          required: ["stepId", "title", "description", "type"],
        },
      },
    },
    required: ["journeyIntro", "steps"],
  },
};

/** Make the timeline read like a guided learning journey */
export async function polishJourneyNarrative(
  journey: CourseJourney
): Promise<CourseJourney> {
  const client = new Anthropic({ apiKey: config.anthropicKey() });

  const outline = journey.steps
    .map(
      (s) =>
        `${s.order}. [${s.type}] ${s.phase} — ${s.title} (${s.timeLabel}): ${s.summary}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: config.claudeModel,
    max_tokens: 4096,
    system: `You lightly polish learner-facing journey copy for an online bootcamp.
- Keep each step title's technical subject unchanged (do not rename topics).
- Descriptions: 1-2 sentences summarizing ONLY what that step's summary already says.
- Do not add topics, tools, or outcomes not present in the outline.
- journeyIntro: 2-3 sentences describing the actual topics listed (from the video).`,
    tools: [NARRATIVE_TOOL],
    tool_choice: { type: "tool", name: "submit_journey_narrative" },
    messages: [
      {
        role: "user",
        content: `Course: ${journey.courseName}

Steps:
${outline}

Write journeyIntro (2-3 sentences) and improved title/description per step.
Use type "milestone" for day starts, "watch" when video is central, "learn" for concept sections.`,
      },
    ],
  });

  const tool = response.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return journey;

  const raw = tool.input as {
    journeyIntro: string;
    steps: Array<{
      stepId: string;
      title: string;
      description: string;
      type: JourneyStep["type"];
    }>;
  };

  const byId = new Map(raw.steps.map((s) => [s.stepId, s]));
  for (const step of journey.steps) {
    const patch = byId.get(step.stepId);
    if (patch) {
      step.description = patch.description;
      step.type = patch.type;
    }
  }
  journey.journeyIntro = raw.journeyIntro;
  return journey;
}
