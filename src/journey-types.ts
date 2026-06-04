/** Timeline / journey JSON — review before generating full course */

export interface JourneyVideoSource {
  url: string;
  videoId: string;
  title: string;
  localPath: string;
  durationMs: number;
  dayLabel: string;
}

export type JourneyStepType = "milestone" | "watch" | "learn";

export interface JourneyStep {
  order: number;
  stepId: string;
  type: JourneyStepType;
  phase: string;
  title: string;
  description: string;
  summary: string;
  startMs: number;
  endMs: number;
  timeLabel: string;
  video: {
    sourceUrl: string;
    videoId: string;
    videoTitle: string;
    chunkFile?: string;
    /** CDN URL from POST /v4/upload/file — used in course media blocks */
    cdnUrl?: string;
    /** CDN play URL (same as cdnUrl when set) — never YouTube */
    playUrl?: string;
  };
  /** Transcript for this step — used in step 3 (course generation) */
  transcript: string;
}

export interface CourseJourney {
  courseName: string;
  createdAt: string;
  /** Short narrative — how the learner progresses */
  journeyIntro: string;
  sources: JourneyVideoSource[];
  steps: JourneyStep[];
}
