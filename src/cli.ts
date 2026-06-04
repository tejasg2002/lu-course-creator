import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createCourseFromPrompt } from "./create-course.js";
import { config } from "./config.js";
import { SessionLogger } from "./logger.js";

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const help = argv.includes("--help") || argv.includes("-h");
  const topicsIdx = argv.indexOf("--topics");
  const levelIdx = argv.indexOf("--level");
  const topicCount =
    topicsIdx >= 0 ? parseInt(argv[topicsIdx + 1], 10) : undefined;
  const level = levelIdx >= 0 ? argv[levelIdx + 1] : undefined;

  const skip = new Set<number>();
  for (const idx of [topicsIdx, levelIdx]) {
    if (idx >= 0) {
      skip.add(idx);
      skip.add(idx + 1);
    }
  }
  const positional = argv.filter(
    (a, i) => !a.startsWith("-") && !skip.has(i)
  );
  const prompt = positional.join(" ").trim();
  return { dryRun, help, topicCount, level, prompt };
}

async function promptUser(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(
    "\nDescribe the course you want to create:\n> "
  );
  rl.close();
  return answer.trim();
}

async function main() {
  const { dryRun, help, topicCount, level, prompt: argPrompt } =
    parseArgs(process.argv.slice(2));

  if (help) {
    console.log(`
Lu AI Course Creator

Usage:
  npm run create -- "Introduction to Python for data science"
  npm run create -- --dry-run "React hooks crash course"
  npm run create -- --topics 5 --level intermediate "Node.js APIs"

Options:
  --dry-run     Generate plan only (no API calls)
  --topics N    Number of topics to generate
  --level TEXT  Audience level (beginner, intermediate, advanced)
  --help        Show this help

Env (.env):
  X-API-KEY           LetsUpgrade JWT (Bearer token)
  ANTROPIC_API_KEY    Claude API key
  BASE_URL            Optional API base (default: production)
`);
    return;
  }

  try {
    config.luToken();
    config.anthropicKey();
  } catch (e) {
    console.error((e as Error).message);
    console.error("Copy .env.example to .env and fill in your keys.");
    process.exit(1);
  }

  const prompt = argPrompt || (await promptUser());
  if (!prompt) {
    console.error("Please provide a course description.");
    process.exit(1);
  }

  const logger = new SessionLogger();

  console.log("\nLu AI Course Creator");
  console.log("─".repeat(40));
  console.log(`Log file: ${logger.filePath}`);
  if (dryRun) console.log("(dry run — will not publish)\n");

  try {
    const { plan, result } = await createCourseFromPrompt({
      prompt,
      topicCount: Number.isFinite(topicCount) ? topicCount : undefined,
      level,
      dryRun,
      logger,
    });

    console.log("\n" + "─".repeat(40));
    console.log("Course plan summary:");
    console.log(`  Module: ${plan.module.title}`);
    for (const topic of plan.topics) {
      const lessons = topic.contents?.length ?? 0;
      console.log(
        `  • ${topic.title} — ${lessons} lessons, ${topic.questions?.length ?? 0} questions`
      );
    }

    if (result) {
      const base = config.luBaseUrl.replace(/\/api\/v1$/, "");
      console.log("\nPublished successfully!");
      console.log(`  Module ID: ${result.moduleId}`);
      console.log(`  Lessons:   ${result.contentCount}`);
      console.log(`  Questions: ${result.questionCount}`);
      console.log(`  Admin:     ${base} (open module ${result.moduleId})`);
    } else {
      console.log("\nDry run complete. Run without --dry-run to publish.");
    }
    console.log(`\nFull log: ${logger.filePath}`);
  } catch (err) {
    logger.error("CLI failed", err);
    console.error("\nError:", (err as Error).message);
    console.error(`See log: ${logger.filePath}`);
    process.exit(1);
  } finally {
    logger.close();
  }
}

main();
