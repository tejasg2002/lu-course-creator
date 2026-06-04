import type { JourneyStep } from "./journey-types.js";

/** Bootcamp housekeeping — not a teachable module topic */
const NON_TEACHING_TITLE =
  /\b(certificate|certification|attendance|assignment submission|how to get (your )?certificate|course introduction|bootcamp introduction|welcome\s*&\s*housekeeping|introduction\s+and\s+certification|certification\s+process)\b/i;

const ADMIN_TRANSCRIPT_LINE =
  /\b(certificate|attendance|assignment|mark your|lets? upgrade|let'?s upgrade|passing criteria|description\.?\s*link)\b/i;

export function isNonTeachingTopic(title: string, summary = ""): boolean {
  const text = `${title} ${summary}`.trim();
  if (NON_TEACHING_TITLE.test(text)) return true;
  if (
    /^course introduction\b/i.test(title) &&
    !/\b(excel|python|javascript|data|sql|react|node)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

export function filterTeachingSteps(steps: JourneyStep[]): JourneyStep[] {
  return steps.filter(
    (s) =>
      (s.type === "watch" || s.type === "learn") &&
      !isNonTeachingTopic(s.title, s.description)
  );
}

/** Drop leading transcript lines from the previous segment (cert intro, etc.) */
export function trimTranscriptBleed(transcript: string): string {
  const lines = transcript.split("\n");
  let i = 0;
  while (i < lines.length && ADMIN_TRANSCRIPT_LINE.test(lines[i])) {
    i++;
  }
  return lines.slice(i).join("\n").trim();
}

export function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

export function preferCdnUrl(step: JourneyStep): string | undefined {
  const cdn = step.video.cdnUrl?.trim();
  if (cdn?.startsWith("http") && !isYoutubeUrl(cdn)) return cdn;
  const play = step.video.playUrl?.trim();
  if (play?.startsWith("http") && !isYoutubeUrl(play)) return play;
  return undefined;
}
