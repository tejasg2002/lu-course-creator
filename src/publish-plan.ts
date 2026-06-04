import { assertPlanUsesCdnOnly, repairPlanFromJourney } from "./cdn-video.js";
import type { ProgressCallback } from "./journey-builder.js";
import type { CourseJourney } from "./journey-types.js";
import { SessionLogger } from "./logger.js";
import {
  bulkCreateQuestions,
  createContent,
  createModule,
  createTopic,
  setApiLogger,
} from "./lu-api.js";
import type { CreateResult, PreparedCoursePlan } from "./types.js";

export async function publishPreparedPlan(
  plan: PreparedCoursePlan,
  options?: {
    logger?: SessionLogger;
    onProgress?: ProgressCallback;
    /** When set, fixes YouTube URLs and drops non-teaching topics before publish */
    journey?: CourseJourney;
  }
): Promise<CreateResult> {
  const logger = options?.logger;
  const report = (message: string, progress?: number) => {
    if (logger) logger.progress(message);
    else options?.onProgress?.(message, progress);
  };

  if (logger) {
    setApiLogger((method, path, status, detail) => {
      logger.info("API", { method, path, status, detail });
    });
  }

  if (options?.journey) {
    const repairNotes = repairPlanFromJourney(plan, options.journey);
    for (const note of repairNotes) report(`  ${note}`, 2);
  }

  assertPlanUsesCdnOnly(plan);

  try {
    report("Creating module on LetsUpgrade…", 5);
    const thumbnail = (plan.module as { thumbnail?: string }).thumbnail;
    const moduleId = await createModule(
      plan.module.title,
      plan.module.tags,
      thumbnail
    );
    logger?.info("Module created", { moduleId });

    const topicIds: string[] = [];
    let contentCount = 0;
    let questionCount = 0;

    const topicTotal = plan.topics.length;
    for (let t = 0; t < topicTotal; t++) {
      const topic = plan.topics[t]!;
      const pct = 10 + Math.round(((t + 1) / topicTotal) * 85);
      report(`Publishing topic ${t + 1}/${topicTotal}: ${topic.title}`, pct);
      const topicId = await createTopic(moduleId, topic.title);
      topicIds.push(topicId);

      for (const content of topic.contents) {
        await createContent(moduleId, topicId, {
          title: content.title,
          description: content.description,
          color: content.color,
          duration: content.duration,
          blocks: content.blocks,
          priority: content.priority,
        });
        contentCount++;
      }

      questionCount += await bulkCreateQuestions(
        moduleId,
        topicId,
        topic.questions ?? []
      );
    }

    const result: CreateResult = {
      moduleId,
      moduleTitle: plan.module.title,
      topicIds,
      contentCount,
      questionCount,
    };
    logger?.info("Publish complete", { ...result });
    return result;
  } finally {
    setApiLogger(undefined);
  }
}
