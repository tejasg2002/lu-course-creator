import { applyLessonColorToBlocks, assignBlockIndices } from "./blocks.js";
import { colorForLessonSlot, type LessonColorName } from "./lesson-colors.js";
import type { ContentBlock, PlannedContent, TopicDraft } from "./types.js";
import {
  ensureStringArray,
  firstParagraph,
  isGenericFiller,
} from "./video-fidelity.js";

function padLearnItems(items: unknown, strict: boolean): string[] {
  const out = ensureStringArray(items, 4);
  if (strict) return out;
  const defaults = [
    "Core concepts and definitions",
    "Real-world applications and examples",
    "Best practices and common pitfalls",
    "Hands-on practice exercises",
  ];
  while (out.length < 4) out.push(defaults[out.length]);
  return out;
}

function padBullets(items: unknown, strict: boolean, deepDive: string): [string, string] {
  const out = ensureStringArray(items, 4).filter((s) => !isGenericFiller(s));
  if (strict) {
    if (out.length >= 2) return [out[0], out[1]];
    const fallback = firstParagraph(deepDive, 120);
    return [out[0] ?? fallback, out[1] ?? fallback];
  }
  while (out.length < 2) {
    out.push(
      out.length === 0
        ? "Industry-relevant skill"
        : "Foundation for advanced topics"
    );
  }
  return [out[0], out[1]];
}

function padConcepts(
  concepts: Array<{ title: string; content: string }>,
  topicTitle: string,
  strict: boolean,
  deepDive: string
) {
  const out = concepts
    .filter((c) => c.title?.trim() && c.content?.trim() && !isGenericFiller(c.content))
    .slice(0, 3);
  if (strict) {
    if (out.length > 0) return out;
    const parts = deepDive.split(/\n\n+/).filter((p) => p.trim().length > 30);
    return parts.slice(0, 3).map((content, i) => ({
      title: `${topicTitle} — point ${i + 1}`,
      content: content.trim(),
    }));
  }
  const defaults = [
    {
      title: "Concept 1",
      content: `The fundamental principle behind ${topicTitle} and why it matters.`,
    },
    {
      title: "Concept 2",
      content: `How ${topicTitle} connects to other topics in this module.`,
    },
    {
      title: "Concept 3",
      content: "Common mistakes to avoid and best practices to follow.",
    },
  ];
  while (out.length < 3) out.push(defaults[out.length]);
  return out;
}

function padFaqs(
  faqs: Array<{ question: string; answer: string }>,
  strict: boolean
) {
  return faqs
    .filter((f) => f.question?.trim() && f.answer?.trim())
    .slice(0, 3);
}

function textOrFromDeepDive(
  primary: string | undefined,
  deepDive: string,
  strict: boolean
): string {
  const p = primary?.trim();
  if (p && !isGenericFiller(p)) return p;
  if (strict && deepDive.trim()) return firstParagraph(deepDive, 500);
  return p ?? "";
}

/** Build 5 contents per topic matching LetsUpgrade admin UI seed format */
export function buildTopicContents(
  draft: TopicDraft,
  topicIndex = 0,
  opts?: { strict?: boolean }
): PlannedContent[] {
  const strict = opts?.strict === true;
  const topic = draft.title.trim();
  const deepDive = draft.deepDiveContent?.trim() ?? "";
  const learn = padLearnItems(draft.learnItems, strict);
  const bullets = padBullets(draft.whyBullets, strict, deepDive);
  const concepts = padConcepts(draft.concepts ?? [], topic, strict, deepDive);
  const faqs = padFaqs(draft.faqs ?? [], strict);
  const videoUrl =
    draft.videoUrl && !/youtube\.com|youtu\.be/i.test(draft.videoUrl)
      ? draft.videoUrl
      : undefined;

  const intro = textOrFromDeepDive(draft.introText, deepDive, strict);
  const why = textOrFromDeepDive(draft.whyText, deepDive, strict);
  const takeaways = textOrFromDeepDive(draft.takeawaysContent, deepDive, strict);

  const c = (slot: number): LessonColorName => colorForLessonSlot(topicIndex, slot);

  const blocksForLesson = (slot: number, blocks: ContentBlock[]) =>
    applyLessonColorToBlocks(assignBlockIndices(blocks), c(slot));

  const lessons: PlannedContent[] = [
    {
      title: `👋 Introduction to ${topic}`,
      description: "2 min",
      color: c(0),
      duration: 2,
      priority: 1,
      blocks: blocksForLesson(0, [
        ...(intro ? [{ type: "text" as const, content: intro }] : []),
        ...(learn.length > 0
          ? [
              {
                type: "section" as const,
                color: c(0),
                title: "📚 What You Will Learn",
                items: learn.map((content) => ({ icon: "Check", content })),
              },
            ]
          : []),
      ]),
    },
    {
      title: "💡 Why This Matters",
      description: "2 min",
      color: c(1),
      duration: 2,
      priority: 2,
      blocks: blocksForLesson(1, [
        ...(why ? [{ type: "text" as const, content: why }] : []),
        {
          type: "section",
          color: c(1),
          gapped: true,
          items: bullets.map((content) => ({ icon: "star", content })),
        },
      ]),
    },
    {
      title: "📖 Deep Dive",
      description: "8 min",
      color: c(2),
      duration: 8,
      priority: 3,
      blocks: blocksForLesson(2, [
        ...(videoUrl
          ? [
              {
                type: "media" as const,
                mediaType: "video" as const,
                url: videoUrl,
              },
            ]
          : []),
        ...(deepDive
          ? [
              {
                type: "section" as const,
                color: c(2),
                title: `🔍 ${topic}`,
                content: deepDive,
              },
            ]
          : []),
        ...(takeaways
          ? [
              {
                type: "section" as const,
                color: c(2),
                title: "📝 Key Takeaways",
                content: takeaways,
              },
            ]
          : []),
      ]),
    },
    {
      title: "🔑 Key Concepts",
      description: "5 min",
      color: c(3),
      duration: 5,
      priority: 4,
      blocks: blocksForLesson(
        3,
        concepts.map((concept) => ({
          type: "section" as const,
          color: c(3),
          highlight: true,
          title: concept.title,
          content: concept.content,
        }))
      ),
    },
    {
      title: "❓ FAQs",
      description: "3 min",
      color: c(4),
      duration: 3,
      priority: 5,
      blocks: blocksForLesson(
        4,
        faqs.map((f) => ({
          type: "faq" as const,
          color: c(4),
          question: f.question,
          answer: f.answer,
        }))
      ),
    },
  ];

  return lessons.filter((lesson) => lesson.blocks.length > 0);
}

export function draftToTopic(
  draft: TopicDraft,
  topicIndex = 0,
  opts?: { strict?: boolean }
): {
  title: string;
  contents: PlannedContent[];
  questions: TopicDraft["questions"];
} {
  return {
    title: draft.title,
    contents: buildTopicContents(draft, topicIndex, opts),
    questions: draft.questions ?? [],
  };
}
