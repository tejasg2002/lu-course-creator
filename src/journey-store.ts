import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CourseJourney, JourneyStep } from "./journey-types.js";
import { transcriptBodyLength } from "./transcript-slice.js";
import {
  enrichJourneyFromCourseDisk,
  loadJourneyForCourse,
} from "./workspace-store.js";

const OUTPUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "output"
);
const JOURNEY_FILE = path.join(OUTPUT_DIR, "course-journey.json");

export function saveJourney(journey: CourseJourney): string {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(JOURNEY_FILE, JSON.stringify(journey, null, 2), "utf8");
  return JOURNEY_FILE;
}

export function loadJourney(): CourseJourney | null {
  if (!fs.existsSync(JOURNEY_FILE)) return null;
  return JSON.parse(fs.readFileSync(JOURNEY_FILE, "utf8")) as CourseJourney;
}

export function getJourneyPath(): string {
  return JOURNEY_FILE;
}

/** Restore step transcripts from disk when the client sends a trimmed journey */
export function enrichJourneyFromDisk(
  journey: CourseJourney,
  courseId?: string
): CourseJourney {
  if (courseId) return enrichJourneyFromCourseDisk(courseId, journey);

  const saved = loadJourney();
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

export function transcriptForStep(
  step: JourneyStep,
  courseId?: string
): string {
  const saved = courseId
    ? loadJourneyForCourse(courseId)
    : loadJourney();
  const fromDisk = saved?.steps.find((s) => s.stepId === step.stepId)?.transcript;
  return (fromDisk ?? step.transcript ?? "").trim();
}
