import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PreparedCoursePlan } from "./types.js";

const OUTPUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "output"
);
const DRAFT_FILE = path.join(OUTPUT_DIR, "draft-plan.json");

export interface StoredDraft {
  savedAt: string;
  source: "bootcamp" | "prompt" | "manual";
  warnings: string[];
  plan: PreparedCoursePlan;
}

export function saveDraft(draft: StoredDraft): string {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(DRAFT_FILE, JSON.stringify(draft, null, 2), "utf8");
  return DRAFT_FILE;
}

export function loadDraft(): StoredDraft | null {
  if (!fs.existsSync(DRAFT_FILE)) return null;
  return JSON.parse(fs.readFileSync(DRAFT_FILE, "utf8")) as StoredDraft;
}

export function getDraftPath(): string {
  return DRAFT_FILE;
}
