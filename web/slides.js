import { COLOR_CSS_MAP, headingColor } from "./colors.js";

/** Turn a course plan into ordered slides for the deck viewer */
export function planToSlides(plan) {
  if (!plan?.topics?.length) return [];

  const slides = [];
  slides.push({
    kind: "module",
    title: plan.module?.title ?? "Course",
    subtitle: `${plan.topics.length} sections · learner preview`,
    accent: COLOR_CSS_MAP.violet,
  });

  plan.topics.forEach((topic, topicIndex) => {
    const accent = headingColor(topicIndex, 0);
    slides.push({
      kind: "section",
      sectionIndex: topicIndex + 1,
      title: topic.title,
      lessonCount: topic.contents?.length ?? 0,
      quizCount: topic.questions?.length ?? 0,
      accent,
    });

    (topic.contents ?? []).forEach((lesson, lessonIndex) => {
      slides.push({
        kind: "lesson",
        topicTitle: topic.title,
        title: lesson.title,
        description: lesson.description,
        accent: headingColor(topicIndex, lessonIndex),
        lessonIndex: lessonIndex + 1,
        sectionIndex: topicIndex + 1,
      });

      const blocks = lesson.blocks ?? [];
      blocks.forEach((block, blockIndex) => {
        const slide = blockToSlide(block, {
          topicTitle: topic.title,
          lessonTitle: lesson.title,
          accent: headingColor(topicIndex, lessonIndex),
          blockIndex: blockIndex + 1,
          totalBlocks: blocks.length,
        });
        if (slide) slides.push(slide);
      });
    });

    if (topic.questions?.length) {
      topic.questions.forEach((q, qi) => {
        slides.push({
          kind: "quiz",
          topicTitle: topic.title,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          accent,
          quizIndex: qi + 1,
          totalQuizzes: topic.questions.length,
        });
      });
    }
  });

  return slides;
}

function blockToSlide(block, ctx) {
  const base = {
    topicTitle: ctx.topicTitle,
    lessonTitle: ctx.lessonTitle,
    accent: ctx.accent,
    blockIndex: ctx.blockIndex,
    totalBlocks: ctx.totalBlocks,
  };

  switch (block.type) {
    case "text":
      return { kind: "text", content: block.content, ...base };
    case "media":
      if (block.mediaType === "video" && block.url) {
        return { kind: "video", url: block.url, ...base };
      }
      return null;
    case "section":
      return {
        kind: "section-block",
        title: block.title,
        content: block.content,
        items: block.items,
        ...base,
      };
    case "faq":
      return {
        kind: "faq",
        question: block.question,
        answer: block.answer,
        ...base,
      };
    default:
      return null;
  }
}

export function slideLabel(slide, index, total) {
  const n = `${index + 1} / ${total}`;
  if (slide.kind === "module") return `Overview · ${n}`;
  if (slide.kind === "section") return `Section ${slide.sectionIndex} · ${n}`;
  if (slide.kind === "lesson") return `Lesson · ${n}`;
  if (slide.kind === "quiz") return `Quiz · ${n}`;
  return `Slide · ${n}`;
}
