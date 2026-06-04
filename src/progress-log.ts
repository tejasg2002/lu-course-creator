/** Human-readable progress lines in the terminal (npm run dev) */

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function logToTerminal(
  message: string,
  options?: { progress?: number; phase?: string }
): void {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return;

  const pct =
    options?.progress !== undefined
      ? `${String(Math.round(options.progress)).padStart(3)}%`
      : "   ";
  const phase = options?.phase ? ` · ${options.phase}` : "";
  console.log(`[CourseLoom ${timestamp()}] ${pct} ${text}${phase}`);
}

export function logBanner(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`);
}

export function logBannerEnd(title: string): void {
  console.log(`── ${title} complete ──\n`);
}
