import { generateCoursePlan } from "./ai.js";
import { SessionLogger } from "./logger.js";
import { publishPreparedPlan } from "./publish-plan.js";
import { prepareCoursePlan } from "./sanitize.js";
import type { CoursePlan, CreateResult } from "./types.js";

export interface CreateCourseOptions {
  prompt: string;
  topicCount?: number;
  level?: string;
  dryRun?: boolean;
  logger?: SessionLogger;
  onProgress?: (message: string) => void;
}

export async function createCourseFromPrompt(
  options: CreateCourseOptions
): Promise<{ plan: CoursePlan; result?: CreateResult }> {
  const logger = options.logger;
  const log = (message: string) => {
    if (logger) logger.progress(message);
    else options.onProgress?.(message);
  };

  logger?.info("Course creation started", {
    prompt: options.prompt,
    dryRun: options.dryRun ?? false,
  });

  try {
    log("Generating course structure with Claude...");
    const rawPlan = await generateCoursePlan(options.prompt, {
      topicCount: options.topicCount,
      level: options.level,
      logger,
    });

    const { plan, warnings } = prepareCoursePlan(rawPlan);
    for (const w of warnings) {
      log(`  Note: ${w}`);
      logger?.info(w);
    }

    const lessonCount = plan.topics.reduce(
      (n, t) => n + t.contents.length,
      0
    );
    log(
      `Plan ready: "${plan.module.title}" — ${plan.topics.length} topics, ${lessonCount} lessons`
    );

    if (options.dryRun) {
      log("Dry run — skipping API publish.");
      return { plan };
    }

    const result = await publishPreparedPlan(plan, { logger, onProgress: log });
    return { plan, result };
  } catch (err) {
    logger?.error("Course creation failed", err);
    throw err;
  }
}
