import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { asAuthed, courseIdFromRequest } from "./api-context.js";
import {
  bearerToken,
  defaultCredentials,
  getSession,
  login,
  logout,
  requireAuth,
  signCookie,
} from "./auth.js";
import { DEFAULT_BOOTCAMP_URLS } from "./bootcamp.js";
import { buildCourseFromJourney } from "./course-from-journey.js";
import { config } from "./config.js";
import { normalizeJourneyVideos } from "./cdn-video.js";
import { buildCourseJourney } from "./journey-builder.js";
import { enrichJourneyFromDisk } from "./journey-store.js";
import type { CourseJourney } from "./journey-types.js";
import { setApiLogger } from "./lu-api.js";
import { publishPreparedPlan } from "./publish-plan.js";
import { prepareCoursePlan } from "./sanitize.js";
import { logBanner, logBannerEnd, logToTerminal } from "./progress-log.js";
import { uploadFileToCdn } from "./upload.js";
import type { PreparedCoursePlan } from "./types.js";
import {
  createCourse,
  deleteCourse,
  getCourse,
  initWorkspaces,
  listCourses,
  loadDraftForCourse,
  loadJourneyForCourse,
  saveDraftForCourse,
  saveJourneyForCourse,
  updateCourseMeta,
} from "./workspace-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(__dirname, "..", "web");
const PORT = Number(process.env.PORT) || 3789;

initWorkspaces();

const app = express();
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

app.use(express.json({ limit: "20mb" }));
app.use(express.static(WEB_DIR));

let processing = false;
let lastStatus = {
  phase: "idle" as string,
  messages: [] as string[],
  progress: 0,
  label: "",
};

function reportProgress(msg: string, progress?: number) {
  lastStatus.messages.push(msg);
  if (lastStatus.messages.length > 100) {
    lastStatus.messages = lastStatus.messages.slice(-100);
  }
  const line = msg.replace(/\s+/g, " ").trim();
  if (line) lastStatus.label = line;
  if (progress !== undefined) {
    lastStatus.progress = Math.min(100, Math.max(0, Math.round(progress)));
  }
  logToTerminal(msg, {
    progress: progress ?? lastStatus.progress,
    phase: lastStatus.phase,
  });
}

function jwtMeta(token: string): { exp?: string; expired?: boolean } {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString()
    ) as { exp?: number };
    if (!payload.exp) return {};
    const expMs = payload.exp * 1000;
    return {
      exp: new Date(expMs).toISOString(),
      expired: Date.now() > expMs,
    };
  } catch {
    return {};
  }
}

async function checkLuAuth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const token = config.luToken();
    const res = await fetch(`${config.luBaseUrl}/modules?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { ok: true, detail: "LU API token valid" };
    const text = await res.text();
    return {
      ok: false,
      detail: `LU API ${res.status}: ${text.slice(0, 120)}`,
    };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/* —— Public auth —— */
app.get("/api/auth/config", (_req, res) => {
  const creds = defaultCredentials();
  res.json({
    appName: "CourseLoom",
    defaultUsername: creds.username,
    hint: "Default password is set in .env (STUDIO_PASSWORD) or 'courseloom'",
  });
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const session = login(username, password);
  if (!session) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  const signed = signCookie(session.token);
  res.cookie("courseloom_token", signed, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({
    ok: true,
    token: session.token,
    user: session.user,
    activeCourseId: session.activeCourseId,
  });
});

app.post("/api/auth/logout", (req, res) => {
  const token = bearerToken(req);
  if (token) logout(token);
  res.clearCookie("courseloom_token");
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const session = asAuthed(req).studioSession;
  res.json({
    user: session.user,
    activeCourseId: session.activeCourseId,
  });
});

/* —— Protected API —— */
const api = express.Router();
api.use(requireAuth);

api.get("/health", async (_req, res) => {
  let tokenMeta: ReturnType<typeof jwtMeta> = {};
  let luAuth: Awaited<ReturnType<typeof checkLuAuth>> = {
    ok: false,
    detail: "X-API-KEY not set",
  };
  try {
    const token = config.luToken();
    tokenMeta = jwtMeta(token);
    luAuth = await checkLuAuth();
  } catch (e) {
    luAuth = { ok: false, detail: (e as Error).message };
  }
  res.json({
    ok: luAuth.ok,
    processing,
    auth: {
      ...luAuth,
      ...tokenMeta,
      hint: !luAuth.ok
        ? "Copy a fresh JWT from LU admin into .env (X-API-KEY), then restart npm run dev."
        : undefined,
    },
  });
});

api.get("/courses", (_req, res) => {
  res.json({ courses: listCourses() });
});

api.post("/courses", (req, res) => {
  const name = String(req.body?.name ?? "New course").trim();
  const urls: string[] = Array.isArray(req.body?.urls)
    ? req.body.urls.map(String)
    : [];
  const course = createCourse(name, urls);
  const session = asAuthed(req).studioSession;
  session.activeCourseId = course.id;
  res.json({ ok: true, course });
});

api.get("/courses/:id", (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.json({ course });
});

api.patch("/courses/:id", (req, res) => {
  const course = updateCourseMeta(req.params.id, {
    name: req.body?.name?.trim(),
    status: req.body?.status,
  });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.json({ ok: true, course });
});

api.delete("/courses/:id", (req, res) => {
  if (!deleteCourse(req.params.id)) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.json({ ok: true });
});

api.post("/courses/:id/select", (req, res) => {
  const course = getCourse(req.params.id);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const session = asAuthed(req).studioSession;
  session.activeCourseId = course.id;
  res.json({ ok: true, courseId: course.id });
});

api.get("/bootcamp/defaults", (_req, res) => {
  res.json({ urls: DEFAULT_BOOTCAMP_URLS });
});

api.get("/status", (_req, res) => {
  res.json(lastStatus);
});

api.post("/upload", fileUpload.single("file"), async (req, res) => {
  try {
    config.luToken();
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const resource = (req.body?.resource as string)?.trim() || "modules";
    const result = await uploadFileToCdn(
      req.file.buffer,
      req.file.originalname,
      { resource, mimeType: req.file.mimetype }
    );
    res.json({ ok: true, url: result.url });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

api.post("/journey/build", async (req, res) => {
  if (processing) {
    res.status(409).json({ error: "Busy" });
    return;
  }
  processing = true;
  lastStatus = { phase: "journey", messages: [], progress: 0, label: "Starting…" };
  logBanner("Journey build");

  try {
    config.anthropicKey();
    config.luToken();
    const courseId = courseIdFromRequest(asAuthed(req));
    const courseName = req.body?.courseName?.trim();
    const urls: string[] = req.body?.urls ?? [];
    if (!courseName) {
      res.status(400).json({ error: "Course name is required" });
      return;
    }
    if (!urls.length) {
      res.status(400).json({ error: "At least one YouTube URL is required" });
      return;
    }

    updateCourseMeta(courseId, { name: courseName, sourceUrls: urls });

    reportProgress("Building journey…", 1);
    const journey = await buildCourseJourney({
      courseName,
      urls,
      uploadChunksToCdn: req.body?.uploadChunksToCdn !== false,
      onProgress: reportProgress,
    });
    const path = saveJourneyForCourse(courseId, journey);
    lastStatus.phase = "journey_ready";
    reportProgress("Timeline ready", 100);
    logBannerEnd("Journey build");

    res.json({ ok: true, journey, path, courseId });
  } catch (e) {
    lastStatus.phase = "error";
    reportProgress(`Error: ${(e as Error).message}`, lastStatus.progress);
    console.error(`[CourseLoom] Journey build failed: ${(e as Error).message}`);
    res.status(500).json({ error: (e as Error).message, messages: lastStatus.messages });
  } finally {
    processing = false;
  }
});

api.get("/journey", (req, res) => {
  const courseId = courseIdFromRequest(asAuthed(req));
  const journey = loadJourneyForCourse(courseId);
  if (!journey) {
    res.status(404).json({ error: "No journey yet" });
    return;
  }
  normalizeJourneyVideos(journey);
  res.json({ ...journey, courseId });
});

api.put("/journey", (req, res) => {
  try {
    const courseId = courseIdFromRequest(asAuthed(req));
    const journey = req.body as CourseJourney;
    if (!journey?.courseName || !Array.isArray(journey.steps)) {
      res.status(400).json({ error: "Invalid journey JSON" });
      return;
    }
    normalizeJourneyVideos(journey);
    const path = saveJourneyForCourse(courseId, journey);
    res.json({ ok: true, path, courseId });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

api.post("/course/build", async (req, res) => {
  if (processing) {
    res.status(409).json({ error: "Busy" });
    return;
  }
  processing = true;
  lastStatus = { phase: "course", messages: [], progress: 0, label: "Starting…" };
  logBanner("Course generation");

  try {
    config.anthropicKey();
    const courseId = courseIdFromRequest(asAuthed(req));
    const journey =
      (req.body as CourseJourney)?.steps?.length > 0
        ? enrichJourneyFromDisk(req.body as CourseJourney, courseId)
        : loadJourneyForCourse(courseId);
    if (!journey) {
      res.status(400).json({ error: "Build journey first or send journey JSON" });
      return;
    }

    reportProgress("Generating course from video transcripts…", 2);
    const rawPlan = await buildCourseFromJourney(journey, {
      onProgress: reportProgress,
      courseId,
    });

    reportProgress("Applying lesson structure…", 96);
    const { plan, warnings } = prepareCoursePlan(rawPlan, { strict: true });
    const path = saveDraftForCourse(courseId, {
      savedAt: new Date().toISOString(),
      source: "bootcamp",
      warnings,
      plan,
    });

    saveJourneyForCourse(courseId, journey);
    lastStatus.phase = "course_ready";
    reportProgress("Course ready for Studio", 100);
    logBannerEnd("Course generation");
    res.json({ ok: true, plan, warnings, path, journey, courseId });
  } catch (e) {
    lastStatus.phase = "error";
    reportProgress(`Error: ${(e as Error).message}`, lastStatus.progress);
    console.error(`[CourseLoom] Course build failed: ${(e as Error).message}`);
    res.status(500).json({ error: (e as Error).message, messages: lastStatus.messages });
  } finally {
    processing = false;
  }
});

api.get("/draft", (req, res) => {
  const courseId = courseIdFromRequest(asAuthed(req));
  const draft = loadDraftForCourse(courseId);
  if (!draft) {
    res.status(404).json({ error: "No course draft yet" });
    return;
  }
  res.json({ ...draft, courseId });
});

api.put("/draft", (req, res) => {
  try {
    const courseId = courseIdFromRequest(asAuthed(req));
    const plan = req.body?.plan as PreparedCoursePlan;
    if (!plan?.module?.title) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }
    const path = saveDraftForCourse(courseId, {
      savedAt: new Date().toISOString(),
      source: "manual",
      warnings: [],
      plan,
    });
    res.json({ ok: true, path, courseId });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

api.post("/publish", async (req, res) => {
  if (processing) {
    res.status(409).json({ error: "Busy" });
    return;
  }
  try {
    config.luToken();
    const courseId = courseIdFromRequest(asAuthed(req));
    let plan = req.body?.plan as PreparedCoursePlan | undefined;
    if (!plan) {
      const draft = loadDraftForCourse(courseId);
      if (!draft) {
        res.status(400).json({ error: "No course to publish" });
        return;
      }
      plan = draft.plan;
    }

    processing = true;
    lastStatus = { phase: "publishing", messages: [], progress: 0, label: "Publishing…" };
    logBanner("Publish to LetsUpgrade");
    const journey = loadJourneyForCourse(courseId);
    setApiLogger((method, p, status, detail) => {
      logToTerminal(`API ${method} ${p} → ${status}${detail ? ` (${detail})` : ""}`, {
        phase: "publishing",
      });
    });
    let result;
    try {
      result = await publishPreparedPlan(plan, {
        onProgress: reportProgress,
        journey: journey ?? undefined,
      });
    } finally {
      setApiLogger(undefined);
    }
    lastStatus.phase = "published";
    reportProgress("Published to LetsUpgrade", 100);
    updateCourseMeta(courseId, {
      status: "published",
      publishedModuleId: result.moduleId,
    });
    saveDraftForCourse(courseId, {
      savedAt: new Date().toISOString(),
      source: "bootcamp",
      warnings: [],
      plan,
    });
    logBannerEnd("Publish");
    res.json({ ok: true, result, plan, courseId });
  } catch (e) {
    lastStatus.phase = "error";
    reportProgress(`Error: ${(e as Error).message}`, lastStatus.progress);
    console.error(`[CourseLoom] Publish failed: ${(e as Error).message}`);
    res.status(500).json({ error: (e as Error).message });
  } finally {
    processing = false;
  }
});

app.use("/api", api);

const creds = defaultCredentials();
const server = app.listen(PORT, () => {
  console.log(`\nCourseLoom AI → http://localhost:${PORT}`);
  console.log(`Studio login: ${creds.username} / (see STUDIO_PASSWORD in .env)`);
  console.log(`Workspaces: data/workspaces/\n`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} in use. Run: lsof -ti :${PORT} | xargs kill -9\n`);
    process.exit(1);
  }
  throw err;
});
