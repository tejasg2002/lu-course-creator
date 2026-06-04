/**
 * LetsUpgrade admin lesson/content colors — keys from LU admin COLOR_DISPLAY_MAP
 * (e.g. bg-violet-500 → "violet"). Used on every content + section/faq block.
 */

export const LESSON_COLOR_NAMES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

export type LessonColorName = (typeof LESSON_COLOR_NAMES)[number];

/** Same keys as LU admin `COLOR_DISPLAY_MAP` (Tailwind bg classes) */
export const COLOR_DISPLAY_MAP = Object.fromEntries(
  LESSON_COLOR_NAMES.map((name) => [name, `bg-${name}-500`])
) as Record<LessonColorName, string>;

/** Default 5-lesson heading colors per topic (intro → FAQ) */
export const LESSON_HEADING_PALETTE: LessonColorName[] = [
  "violet",
  "rose",
  "indigo",
  "orange",
  "purple",
];

/** CSS accent per color for local web UI (Tailwind 500 equivalents) */
export const COLOR_CSS_MAP: Record<LessonColorName, string> = {
  slate: "#64748b",
  gray: "#6b7280",
  zinc: "#71717a",
  neutral: "#737373",
  stone: "#78716c",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};

export function isLessonColorName(value: string): value is LessonColorName {
  return (LESSON_COLOR_NAMES as readonly string[]).includes(value);
}

export function lessonColorsForTopic(topicIndex: number): LessonColorName[] {
  const offset = topicIndex % LESSON_COLOR_NAMES.length;
  return LESSON_HEADING_PALETTE.map(
    (_, i) => LESSON_COLOR_NAMES[(offset + i) % LESSON_COLOR_NAMES.length]
  );
}

export function colorForLessonSlot(
  topicIndex: number,
  lessonIndex: number
): LessonColorName {
  return lessonColorsForTopic(topicIndex)[lessonIndex] ?? "violet";
}
