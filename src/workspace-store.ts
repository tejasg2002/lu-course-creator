import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CourseJourney } from "./journey-types.js";
import type { StoredDraft } from "./draft-store.js";
import type { PreparedCoursePlan } from "./types.js";
import { transcriptBodyLength } from "./transcript-slice.js";

const ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "workspaces"
);
const INDEX_FILE = path.join(ROOT, "index.json");
const LEGACY_JOURNEY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "output",
  "course-journey.json"
);
const LEGACY_DRAFT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "output",
  "draft-plan.json"
);

export type CourseStatus =
  | "draft"
  | "timeline"
  | "studio"
  | "published"
  | "archived";

export interface CourseMeta {
  id: string;
  name: string;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
  topicCount: number;
  lessonCount: number;
  sourceUrls: string[];
  publishedModuleId?: string;
}

interface WorkspaceIndex {
  courses: CourseMeta[];
  defaultCourseId: string | null;
}

function courseDir(id: string): string {
  return path.join(ROOT, id);
}

function readIndex(): WorkspaceIndex {
  if (!fs.existsSync(INDEX_FILE)) {
    return { courses: [], defaultCourseId: null };
  }
  return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")) as WorkspaceIndex;
}

function writeIndex(index: WorkspaceIndex): void {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
}

function newId(): string {
  return `course_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function countPlanStats(plan?: PreparedCoursePlan): {
  topicCount: number;
  lessonCount: number;
} {
  if (!plan?.topics) return { topicCount: 0, lessonCount: 0 };
  return {
    topicCount: plan.topics.length,
    lessonCount: plan.topics.reduce(
      (n, t) => n + (t.contents?.length ?? 0),
      0
    ),
  };
}

function inferStatus(
  hasJourney: boolean,
  hasDraft: boolean,
  published?: string
): CourseStatus {
  if (published) return "published";
  if (hasDraft) return "studio";
  if (hasJourney) return "timeline";
  return "draft";
}

function migrateLegacyIfNeeded(): void {
  const index = readIndex();
  if (index.courses.length > 0) return;

  const hasLegacy =
    fs.existsSync(LEGACY_JOURNEY) || fs.existsSync(LEGACY_DRAFT);
  if (!hasLegacy) return;

  const id = newId();
  const dir = courseDir(id);
  fs.mkdirSync(dir, { recursive: true });

  let name = "Imported course";
  let sourceUrls: string[] = [];
  if (fs.existsSync(LEGACY_JOURNEY)) {
    const j = JSON.parse(
      fs.readFileSync(LEGACY_JOURNEY, "utf8")
    ) as CourseJourney;
    name = j.courseName || name;
    sourceUrls = j.sources?.map((s) => s.url) ?? [];
    fs.copyFileSync(LEGACY_JOURNEY, path.join(dir, "journey.json"));
  }
  if (fs.existsSync(LEGACY_DRAFT)) {
    fs.copyFileSync(LEGACY_DRAFT, path.join(dir, "draft.json"));
  }

  let topicCount = 0;
  let lessonCount = 0;
  let publishedModuleId: string | undefined;
  if (fs.existsSync(path.join(dir, "draft.json"))) {
    const d = JSON.parse(
      fs.readFileSync(path.join(dir, "draft.json"), "utf8")
    ) as StoredDraft;
    const stats = countPlanStats(d.plan);
    topicCount = stats.topicCount;
    lessonCount = stats.lessonCount;
  }

  const meta: CourseMeta = {
    id,
    name,
    status: inferStatus(
      fs.existsSync(path.join(dir, "journey.json")),
      fs.existsSync(path.join(dir, "draft.json")),
      publishedModuleId
    ),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    topicCount,
    lessonCount,
    sourceUrls,
    publishedModuleId,
  };

  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8"
  );

  index.courses.push(meta);
  index.defaultCourseId = id;
  writeIndex(index);
}

export function initWorkspaces(): void {
  fs.mkdirSync(ROOT, { recursive: true });
  migrateLegacyIfNeeded();
}

export function listCourses(): CourseMeta[] {
  initWorkspaces();
  const index = readIndex();
  return index.courses.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getCourse(id: string): CourseMeta | null {
  initWorkspaces();
  return readIndex().courses.find((c) => c.id === id) ?? null;
}

export function createCourse(name: string, sourceUrls: string[] = []): CourseMeta {
  initWorkspaces();
  const index = readIndex();
  const id = newId();
  const now = new Date().toISOString();
  const meta: CourseMeta = {
    id,
    name: name.trim() || "Untitled course",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    topicCount: 0,
    lessonCount: 0,
    sourceUrls,
  };
  const dir = courseDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  index.courses.unshift(meta);
  if (!index.defaultCourseId) index.defaultCourseId = id;
  writeIndex(index);
  return meta;
}

export function updateCourseMeta(
  id: string,
  patch: Partial<
    Pick<
      CourseMeta,
      "name" | "status" | "topicCount" | "lessonCount" | "sourceUrls" | "publishedModuleId"
    >
  >
): CourseMeta | null {
  initWorkspaces();
  const index = readIndex();
  const i = index.courses.findIndex((c) => c.id === id);
  if (i < 0) return null;

  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  ) as Partial<CourseMeta>;
  const meta = {
    ...index.courses[i]!,
    ...clean,
    updatedAt: new Date().toISOString(),
  };
  index.courses[i] = meta;
  writeIndex(index);
  fs.writeFileSync(path.join(courseDir(id), "meta.json"), JSON.stringify(meta, null, 2));
  return meta;
}

export function deleteCourse(id: string): boolean {
  initWorkspaces();
  const index = readIndex();
  const i = index.courses.findIndex((c) => c.id === id);
  if (i < 0) return false;
  index.courses.splice(i, 1);
  if (index.defaultCourseId === id) {
    index.defaultCourseId = index.courses[0]?.id ?? null;
  }
  writeIndex(index);
  const dir = courseDir(id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function resolveCourseId(
  requested: string | undefined,
  sessionActive: string | null
): string {
  initWorkspaces();
  const index = readIndex();
  if (requested && index.courses.some((c) => c.id === requested)) {
    return requested;
  }
  if (sessionActive && index.courses.some((c) => c.id === sessionActive)) {
    return sessionActive;
  }
  if (index.defaultCourseId) return index.defaultCourseId;
  const created = createCourse("My first course");
  return created.id;
}

export function journeyPath(courseId: string): string {
  return path.join(courseDir(courseId), "journey.json");
}

export function draftPath(courseId: string): string {
  return path.join(courseDir(courseId), "draft.json");
}

export function loadJourneyForCourse(courseId: string): CourseJourney | null {
  const p = journeyPath(courseId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as CourseJourney;
}

export function saveJourneyForCourse(
  courseId: string,
  journey: CourseJourney
): string {
  const dir = courseDir(courseId);
  fs.mkdirSync(dir, { recursive: true });
  const p = journeyPath(courseId);
  fs.writeFileSync(p, JSON.stringify(journey, null, 2), "utf8");

  const steps = journey.steps?.filter(
    (s) => s.type === "watch" || s.type === "learn"
  ).length ?? 0;
  updateCourseMeta(courseId, {
    name: journey.courseName,
    status: "timeline",
    topicCount: steps,
    sourceUrls: journey.sources?.map((s) => s.url) ?? [],
  });
  return p;
}

export function loadDraftForCourse(courseId: string): StoredDraft | null {
  const p = draftPath(courseId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as StoredDraft;
}

export function saveDraftForCourse(courseId: string, draft: StoredDraft): string {
  const dir = courseDir(courseId);
  fs.mkdirSync(dir, { recursive: true });
  const p = draftPath(courseId);
  fs.writeFileSync(p, JSON.stringify(draft, null, 2), "utf8");

  const stats = countPlanStats(draft.plan);
  updateCourseMeta(courseId, {
    name: draft.plan.module?.title ?? undefined,
    status: "studio",
    topicCount: stats.topicCount,
    lessonCount: stats.lessonCount,
  });
  return p;
}

/** Restore step transcripts from this course's saved journey */
export function enrichJourneyFromCourseDisk(
  courseId: string,
  journey: CourseJourney
): CourseJourney {
  const saved = loadJourneyForCourse(courseId);
  if (!saved) return journey;

  const byId = new Map(saved.steps.map((s) => [s.stepId, s]));
  for (const step of journey.steps) {
    if (transcriptBodyLength(step.transcript ?? "") >= 80) continue;
    const savedStep = byId.get(step.stepId);
    if (
      savedStep?.transcript &&
      transcriptBodyLength(savedStep.transcript) >= 80
    ) {
      step.transcript = savedStep.transcript;
    }
  }
  return journey;
}
