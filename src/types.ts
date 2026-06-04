export type Difficulty = "easy" | "medium" | "hard";

import type { LessonColorName } from "./lesson-colors.js";

/** Tailwind-style color name for LU admin (never use null — omit or use a palette name) */
export type LessonColor = LessonColorName;

export interface SectionItem {
  icon: string;
  content: string;
}

export type ContentBlock =
  | { idx?: number; type: "text"; content: string }
  | {
      idx?: number;
      type: "section";
      color?: LessonColor;
      title?: string;
      content?: string;
      items?: SectionItem[];
      gapped?: boolean;
      highlight?: boolean;
    }
  | {
      idx?: number;
      type: "faq";
      color?: LessonColor;
      question: string;
      answer: string;
    }
  | { idx?: number; type: "codeblock"; code: string }
  | {
      idx?: number;
      type: "quiz";
      question: string;
      items: string[];
      correctAnswer: string;
    }
  | {
      idx?: number;
      type: "media";
      mediaType: "image" | "video" | "audio";
      url: string;
    }
  | { idx?: number; type: "flashcard"; question: string; answer: string };

/** Copy Claude generates per topic — assembled into 5 UI lessons */
export interface TopicDraft {
  title: string;
  introText: string;
  learnItems: string[];
  whyText: string;
  whyBullets: string[];
  deepDiveContent: string;
  takeawaysContent: string;
  concepts: Array<{ title: string; content: string }>;
  faqs: Array<{ question: string; answer: string }>;
  questions: PlannedQuestion[];
  /** CDN video URL (media.letsupgrade.net) — Deep Dive lesson */
  videoUrl?: string;
  /** Filled after prepareCoursePlan / studio assembly */
  contents?: PlannedContent[];
}

export type PreparedCoursePlan = CoursePlan & {
  topics: Array<TopicDraft & { contents: PlannedContent[] }>;
};

export interface PlannedContent {
  title: string;
  description?: string;
  color?: LessonColor;
  duration?: number;
  priority?: number;
  blocks: ContentBlock[];
}

export interface PlannedTopic {
  title: string;
  contents: PlannedContent[];
  questions: PlannedQuestion[];
}

export interface PlannedQuestion {
  question: string;
  options: [string, string, string, string];
  correctAnswer: string;
  explanation?: string;
  difficulty: Difficulty;
}

export interface CoursePlan {
  module: {
    title: string;
    tags?: string[];
    /** CDN URL from POST /v4/upload/file */
    thumbnail?: string;
  };
  topics: TopicDraft[];
}

export interface ApiSuccess<T> {
  success: true;
  data?: T;
  id?: string;
  message?: string;
  error: null;
}

export interface ApiListSuccess<T> {
  success: true;
  items: T[];
  total: number;
  page: number;
  limit: number;
  message?: string;
  error: null;
}

export interface ApiError {
  success: false;
  error: string;
  statusCode?: number;
  data?: null;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiListSuccess<T> | ApiError;

export interface CreateResult {
  moduleId: string;
  moduleTitle: string;
  topicIds: string[];
  contentCount: number;
  questionCount: number;
}
