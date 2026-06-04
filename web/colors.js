/** Matches LetsUpgrade admin COLOR_DISPLAY_MAP (Tailwind 500) */
export const COLOR_CSS_MAP = {
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

const HEADING_CYCLE = [
  "violet",
  "rose",
  "indigo",
  "orange",
  "purple",
  "teal",
  "cyan",
  "emerald",
];

export function headingColor(topicIndex, slot = 0) {
  const names = Object.keys(COLOR_CSS_MAP);
  const i = (topicIndex + slot) % names.length;
  return COLOR_CSS_MAP[names[i]] ?? COLOR_CSS_MAP.violet;
}

export function lessonHeadingColors(topicIndex) {
  return HEADING_CYCLE.map((_, slot) => headingColor(topicIndex, slot));
}
