import type { PlannedQuestion, TopicDraft } from "./types.js";

/** Generic copy that should never appear in video-based courses */
const GENERIC_PHRASES =
  /\b(industry-relevant|building blocks for more advanced|hands-on practice exercises|best practices and common pitfalls|real-world applications and examples|core concepts and definitions|focus on understanding the 'why'|welcome to this lesson|pay close attention to the patterns|let's break down the key aspects)\b/i;

const GENERIC_LEARN_ITEM =
  /^(core concepts|real-world applications|best practices|hands-on practice|key points from this lesson|as covered in the video segment?)$/i;

export function isGenericFiller(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 12) return true;
  return GENERIC_PHRASES.test(t) || GENERIC_LEARN_ITEM.test(t);
}

/** Claude sometimes returns a string instead of an array */
export function ensureStringArray(value: unknown, max = 8): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, max);
  }
  if (typeof value === "string" && value.trim()) {
    const parts = value
      .split(/\n|(?:\s*[,;•]\s*)|(?:\s+-\s+)/)
      .map((s) => s.trim())
      .filter(Boolean);
    return (parts.length > 1 ? parts : [value.trim()]).slice(0, max);
  }
  return [];
}

export function ensureConcepts(
  value: unknown
): Array<{ title: string; content: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const o = c as Record<string, unknown>;
      const title = String(o.title ?? "").trim();
      const content = String(o.content ?? o.text ?? "").trim();
      if (!title || !content) return null;
      return { title, content };
    })
    .filter((x): x is { title: string; content: string } => x !== null)
    .slice(0, 3);
}

export function ensureFaqs(
  value: unknown
): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((f) => {
      if (!f || typeof f !== "object") return null;
      const o = f as Record<string, unknown>;
      const question = String(o.question ?? "").trim();
      const answer = String(o.answer ?? "").trim();
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((x): x is { question: string; answer: string } => x !== null)
    .slice(0, 3);
}

export function firstParagraph(text: string, maxLen = 400): string {
  const para = text.split(/\n\n+/).find((p) => p.trim().length > 40)?.trim();
  if (!para) return text.trim().slice(0, maxLen);
  return para.length > maxLen ? `${para.slice(0, maxLen - 1)}…` : para;
}

/** Remove template-style filler Claude sometimes adds */
export function cleanTopicDraft(draft: TopicDraft, topicTitle: string): TopicDraft {
  draft.title = topicTitle;

  draft.learnItems = ensureStringArray(draft.learnItems, 4).filter(
    (s) => !isGenericFiller(s)
  );

  draft.whyBullets = ensureStringArray(draft.whyBullets, 4).filter(
    (s) => !isGenericFiller(s)
  );

  draft.concepts = ensureConcepts(draft.concepts).filter(
    (c) => !isGenericFiller(c.content)
  );

  draft.faqs = ensureFaqs(draft.faqs);

  draft.questions = (Array.isArray(draft.questions) ? draft.questions : [])
    .map((q): PlannedQuestion | null => {
      if (!q || typeof q !== "object") return null;
      const o = q as unknown as Record<string, unknown>;
      const opts = ensureStringArray(o.options, 4);
      while (opts.length < 4) opts.push(`Option ${opts.length + 1}`);
      const options = opts.slice(0, 4) as [string, string, string, string];
      const question = String(o.question ?? "").trim();
      if (!question) return null;
      const diff = String(o.difficulty ?? "medium");
      const difficulty = (["easy", "medium", "hard"].includes(diff)
        ? diff
        : "medium") as PlannedQuestion["difficulty"];
      return {
        question,
        options,
        correctAnswer: String(o.correctAnswer ?? options[0] ?? "").trim(),
        explanation: String(o.explanation ?? "").trim(),
        difficulty,
      };
    })
    .filter((q): q is PlannedQuestion => q !== null);

  for (const field of ["introText", "whyText", "deepDiveContent", "takeawaysContent"] as const) {
    const v = draft[field]?.trim();
    if (v && isGenericFiller(v)) {
      draft[field] = "";
    }
  }

  return draft;
}

export function assertTranscriptUsable(transcript: string, topicTitle: string): void {
  const body = transcript.replace(/^\[[\d:]+\]\s*/gm, "").trim();
  if (body.length < 80) {
    throw new Error(
      `Transcript too short for "${topicTitle}" — rebuild journey or widen topic segment.`
    );
  }
}
