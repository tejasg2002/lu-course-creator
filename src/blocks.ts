import { isLessonColorName } from "./lesson-colors.js";
import { isYoutubeUrl } from "./topic-scope.js";
import type { ContentBlock, LessonColor, SectionItem } from "./types.js";

const QUIZ_ITEM_COUNT = 4;

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function normalizeColor(value: unknown): LessonColor | undefined {
  const c = asString(value).toLowerCase().trim();
  if (!c || c === "null") return undefined;
  if (isLessonColorName(c)) return c;
  return undefined;
}

function normalizeSectionItems(raw: unknown): SectionItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: SectionItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const content = asString(e.content ?? e.text ?? e.title).trim();
    if (!content) continue;
    const icon = asString(e.icon || "Check").trim() || "Check";
    items.push({ icon, content });
  }
  return items.length > 0 ? items : undefined;
}

function normalizeQuizItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => asString(x).trim()).filter(Boolean);
}

export function assignBlockIndices(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.map((block, idx) => ({ ...block, idx }));
}

/** Every section/FAQ block gets a palette color (matches LU COLOR_DISPLAY_MAP) */
export function applyLessonColorToBlocks(
  blocks: ContentBlock[],
  lessonColor: LessonColor
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === "section") {
      const color =
        block.color && isLessonColorName(block.color) ? block.color : lessonColor;
      return { ...block, color };
    }
    if (block.type === "faq") {
      const color =
        block.color && isLessonColorName(block.color) ? block.color : lessonColor;
      return { ...block, color };
    }
    return block;
  });
}

/** Normalize a block to LetsUpgrade admin UI shape */
export function sanitizeBlock(block: unknown): ContentBlock | null {
  if (!block || typeof block !== "object") return null;
  const b = block as Record<string, unknown>;
  const type = asString(b.type).toLowerCase().trim();

  switch (type) {
    case "text": {
      const content = asString(b.content).trim();
      if (!content) return null;
      return { type: "text", content };
    }

    case "codeblock": {
      const code = asString(b.code ?? b.content).trim();
      if (!code) return null;
      return { type: "codeblock", code };
    }

    case "quiz": {
      const question = asString(b.question).trim();
      let items = normalizeQuizItems(b.items ?? b.options);
      if (items.length === 0) return null;
      while (items.length < QUIZ_ITEM_COUNT) {
        items = [...items, `Option ${items.length + 1}`];
      }
      items = items.slice(0, QUIZ_ITEM_COUNT);
      let correctAnswer = asString(b.correctAnswer).trim();
      if (!correctAnswer || !items.includes(correctAnswer)) {
        correctAnswer = items[0];
      }
      return {
        type: "quiz",
        question: question || "Quick check",
        items,
        correctAnswer,
      };
    }

    case "section": {
      const title = asString(b.title).trim();
      const content = asString(b.content).trim();
      const items = normalizeSectionItems(b.items);
      const color = normalizeColor(b.color);
      if (!title && !content && !items) return null;

      const section: ContentBlock = { type: "section" };
      const s = section as Extract<ContentBlock, { type: "section" }>;
      if (color) s.color = color;
      if (title) s.title = title;
      if (content) s.content = content;
      if (items) s.items = items;
      if (b.gapped === true) s.gapped = true;
      if (b.highlight === true) s.highlight = true;
      return s;
    }

    case "faq": {
      const question = asString(b.question).trim();
      const answer = asString(b.answer).trim();
      if (!question || !answer) return null;
      const color = normalizeColor(b.color);
      const faq: ContentBlock = { type: "faq", question, answer };
      if (color) {
        (faq as Extract<ContentBlock, { type: "faq" }>).color = color;
      }
      return faq;
    }

    case "media": {
      const url = asString(b.url).trim();
      const mediaType = asString(b.mediaType).toLowerCase();
      if (!url || !["image", "video", "audio"].includes(mediaType)) return null;
      if (mediaType === "video" && isYoutubeUrl(url)) return null;
      return {
        type: "media",
        mediaType: mediaType as "image" | "video" | "audio",
        url,
      };
    }

    case "flashcard": {
      const question = asString(b.question).trim();
      const answer = asString(b.answer).trim();
      if (!question || !answer) return null;
      return { type: "flashcard", question, answer };
    }

    default:
      if (asString(b.content).trim()) {
        return { type: "text", content: asString(b.content) };
      }
      return null;
  }
}

export function sanitizeBlocks(
  blocks: unknown[],
  context: string,
  lessonColor?: LessonColor
): { blocks: ContentBlock[]; warnings: string[] } {
  const warnings: string[] = [];
  const sanitized: ContentBlock[] = [];

  for (const block of blocks ?? []) {
    const clean = sanitizeBlock(block);
    if (clean) sanitized.push(clean);
    else {
      const type =
        block && typeof block === "object"
          ? asString((block as Record<string, unknown>).type)
          : "unknown";
      warnings.push(`${context}: dropped invalid "${type}" block`);
    }
  }

  if (sanitized.length === 0) {
    warnings.push(`${context}: no valid blocks — added placeholder text`);
    sanitized.push({
      type: "text",
      content: "Lesson content.",
    });
  }

  let out = assignBlockIndices(sanitized);
  if (lessonColor && isLessonColorName(lessonColor)) {
    out = applyLessonColorToBlocks(out, lessonColor);
  }

  return { blocks: out, warnings };
}
