import { api, getToken, setToken, setActiveCourseId, getActiveCourseId } from "./auth.js";
import { COLOR_CSS_MAP, headingColor } from "./colors.js";
import { planToSlides, slideLabel } from "./slides.js";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let courses = [];
let activeCourse = null;
let journeyData = null;
let coursePlan = null;
let slides = [];
let slideIndex = 0;
let progressPollTimer = null;

/* —— Auth —— */
function showLogin() {
  $("loginScreen").classList.remove("hidden");
  $("appShell").classList.add("hidden");
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginError").classList.add("hidden");
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: $("loginUser").value.trim(),
        password: $("loginPass").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    setToken(data.token);
    if (data.activeCourseId) setActiveCourseId(data.activeCourseId);
    currentUser = data.user;
    await bootApp();
  } catch (err) {
    $("loginError").textContent = err.message;
    $("loginError").classList.remove("hidden");
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
  } catch { /* ignore */ }
  setToken(null);
  setActiveCourseId(null);
  showLogin();
});

window.addEventListener("courseloom:logout", showLogin);

/* —— UI helpers —— */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg) {
  $("status").textContent = msg;
}

function setView(name) {
  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === name);
  });
  $("viewDashboard").classList.toggle("hidden", name !== "dashboard");
  $("viewDashboard").classList.toggle("active", name === "dashboard");
  $("viewWorkspace").classList.toggle("hidden", name !== "workspace");
  $("viewWorkspace").classList.toggle("active", name === "workspace");

  if (name === "dashboard") {
    $("viewEyebrow").textContent = "Course library";
    $("viewTitle").textContent = "Your courses";
    $("coursePicker").classList.add("hidden");
    $("headerBadge").classList.add("hidden");
  } else {
    $("viewEyebrow").textContent = activeCourse?.name ?? "Workspace";
    $("viewTitle").textContent = "AI course workspace";
    $("coursePicker").classList.remove("hidden");
    $("headerBadge").classList.remove("hidden");
    if (activeCourse) {
      $("headerBadge").textContent = activeCourse.status;
    }
  }
}

function setWorkspaceTab(tab) {
  document.querySelectorAll(".wtab").forEach((t) => {
    t.classList.toggle("active", t.dataset.wtab === tab);
  });
  document.querySelectorAll(".wpanel").forEach((p) => {
    p.classList.toggle("active", p.dataset.wpanel === tab);
    p.classList.toggle("hidden", p.dataset.wpanel !== tab);
  });
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.view === "workspace" && !activeCourse) {
      addChat("ai", "Select a course from the library first, or create a new one.");
      return;
    }
    setView(btn.dataset.view);
  });
});

document.querySelectorAll(".wtab").forEach((btn) => {
  btn.addEventListener("click", () => setWorkspaceTab(btn.dataset.wtab));
});

function addChat(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  $("chatMessages").appendChild(el);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}

/* —— Progress —— */
function updateProgressBar(pct, label) {
  const n = Math.min(100, Math.max(0, Math.round(pct)));
  $("progressBar").style.width = `${n}%`;
  $("progressPct").textContent = `${n}%`;
  $("progressMini").classList.remove("hidden");
  if (label) $("loadingText").textContent = label.slice(0, 140);
}

async function pollServerProgress() {
  try {
    const s = await api("/api/status");
    if (typeof s.progress === "number") {
      updateProgressBar(s.progress, s.label || "");
    }
    if (s.messages?.length) setStatus(s.messages.slice(-12).join("\n"));
  } catch { /* busy */ }
}

function setBusy(busy, text = "CourseLoom is thinking…") {
  document.querySelectorAll("button").forEach((b) => {
    if (b.id !== "logoutBtn") b.disabled = busy;
  });
  $("loadingOverlay").classList.toggle("hidden", !busy);
  if (text) $("loadingText").textContent = text;
  if (busy) {
    progressPollTimer = setInterval(pollServerProgress, 450);
    pollServerProgress();
  } else if (progressPollTimer) {
    clearInterval(progressPollTimer);
    progressPollTimer = null;
    $("progressMini").classList.add("hidden");
    updateProgressBar(0, "");
  }
}

/* —— Courses —— */
async function loadCourses() {
  const data = await api("/api/courses");
  courses = data.courses ?? [];
  renderCourseGrid();
  updateCoursePicker();
}

function renderCourseGrid() {
  const grid = $("courseGrid");
  if (!courses.length) {
    grid.innerHTML =
      '<p class="empty-deck">No courses yet. Create one to get started.</p>';
    return;
  }
  grid.innerHTML = courses
    .map(
      (c) => `
    <article class="course-card" data-id="${escapeHtml(c.id)}">
      <h4>${escapeHtml(c.name)}</h4>
      <p class="meta">${c.topicCount} sections · ${c.lessonCount} lessons</p>
      <span class="pill">${escapeHtml(c.status)}</span>
    </article>`
    )
    .join("");

  grid.querySelectorAll(".course-card").forEach((card) => {
    card.addEventListener("click", () => openCourse(card.dataset.id));
  });
}

function updateCoursePicker() {
  const sel = $("coursePicker");
  sel.innerHTML = courses
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}" ${c.id === activeCourse?.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`
    )
    .join("");
}

$("coursePicker").addEventListener("change", async () => {
  await openCourse($("coursePicker").value);
});

$("newCourseBtn").addEventListener("click", async () => {
  const name = prompt("Course name:", "New bootcamp course");
  if (!name?.trim()) return;
  const data = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: name.trim() }),
  });
  await loadCourses();
  await openCourse(data.course.id);
  addChat("ai", `Created "${data.course.name}". Paste YouTube URLs and say "analyze videos" when ready.`);
});

async function openCourse(id) {
  await api(`/api/courses/${id}/select`, { method: "POST" });
  setActiveCourseId(id);
  activeCourse = courses.find((c) => c.id === id) ?? (await api(`/api/courses/${id}`)).course;
  $("courseName").value = activeCourse.name;
  updateCoursePicker();
  $("headerBadge").textContent = activeCourse.status;

  journeyData = null;
  coursePlan = null;
  try {
    const j = await api("/api/journey");
    journeyData = j;
    $("journeyEditor").value = JSON.stringify(j, null, 2);
    renderJourneyPreview(j);
    addChat("ai", `Loaded timeline with ${j.steps?.length ?? 0} steps.`);
  } catch {
    $("journeyEditor").value = "";
    $("journeyPreview").innerHTML = "";
  }

  try {
    const draft = await api("/api/draft");
    setCoursePlan(draft.plan);
    addChat("ai", `Course has ${draft.plan.topics?.length ?? 0} sections ready in the viewer.`);
  } catch {
    setCoursePlan(null);
  }

  setView("workspace");
  setWorkspaceTab("assistant");
}

/* —— Journey —— */
function formatVideoLabel(video) {
  const url = video?.cdnUrl || video?.playUrl;
  if (url?.startsWith("http") && !/youtube/i.test(url)) {
    return "CDN ✓";
  }
  return "Needs CDN";
}

function renderJourneyPreview(journey) {
  const watchSteps = journey.steps.filter(
    (s) => s.type === "watch" || s.type === "learn"
  );
  $("journeyIntro").textContent = journey.journeyIntro || "";
  $("journeyPreview").innerHTML = journey.steps
    .map((s) => {
      const wi = watchSteps.indexOf(s);
      const accent = wi >= 0 ? headingColor(wi, 0) : COLOR_CSS_MAP.violet;
      return `
      <article class="journey-step" style="border-left: 3px solid ${accent}">
        <span class="order" style="color:${accent}">${s.order}</span>
        <div>
          <strong style="color:${accent}">${escapeHtml(s.title)}</strong>
          <p>${escapeHtml(s.description)}</p>
          <small>${escapeHtml(s.timeLabel)} · ${formatVideoLabel(s.video)}</small>
        </div>
      </article>`;
    })
    .join("");
}

function getJourneyFromEditor() {
  return JSON.parse($("journeyEditor").value);
}

/* —— Slides —— */
function setCoursePlan(plan) {
  coursePlan = plan;
  $("courseEditor").value = plan ? JSON.stringify(plan, null, 2) : "";
  slides = plan ? planToSlides(plan) : [];
  slideIndex = 0;
  renderSlideDeck();
  renderLaunchSummary(plan);
}

function renderSlideDeck() {
  const stage = $("slideStage");
  const outline = $("deckOutline");
  const dots = $("slideDots");

  if (!slides.length) {
    stage.innerHTML = '<p class="empty-deck">Generate a course to browse slide by slide.</p>';
    outline.innerHTML = "";
    dots.innerHTML = "";
    $("slideLabel").textContent = "—";
    return;
  }

  outline.innerHTML = slides
    .map((s, i) => {
      if (s.kind === "section") {
        return `<div class="outline-section" data-i="${i}">§ ${escapeHtml(s.title)}</div>`;
      }
      const label =
        s.kind === "lesson"
          ? s.title?.slice(0, 28)
          : s.kind === "module"
            ? "Overview"
            : s.kind;
      return `<div class="outline-item" data-i="${i}">${escapeHtml(String(label).slice(0, 32))}</div>`;
    })
    .join("");

  outline.querySelectorAll("[data-i]").forEach((el) => {
    el.addEventListener("click", () => goToSlide(Number(el.dataset.i)));
  });

  dots.innerHTML = slides
    .map(
      (_, i) =>
        `<span data-i="${i}" class="${slides[i].kind === "section" ? "section" : ""} ${i === slideIndex ? "active" : ""}"></span>`
    )
    .join("");
  dots.querySelectorAll("[data-i]").forEach((el) => {
    el.addEventListener("click", () => goToSlide(Number(el.dataset.i)));
  });

  renderCurrentSlide();
}

function goToSlide(i) {
  slideIndex = Math.max(0, Math.min(slides.length - 1, i));
  renderCurrentSlide();
}

function renderCurrentSlide() {
  const s = slides[slideIndex];
  const stage = $("slideStage");
  $("slideLabel").textContent = slideLabel(s, slideIndex, slides.length);

  document.querySelectorAll(".outline-item, .outline-section").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.i) === slideIndex);
  });
  document.querySelectorAll(".slide-dots span").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.i) === slideIndex);
  });

  let html = "";
  const eyebrow = (t) => `<p class="slide-eyebrow">${escapeHtml(t)}</p>`;

  switch (s.kind) {
    case "module":
      html = `${eyebrow("Course overview")}<h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.subtitle)}</p>`;
      break;
    case "section":
      html = `${eyebrow(`Section ${s.sectionIndex}`)}<h2>${escapeHtml(s.title)}</h2><p>${s.lessonCount} lessons · ${s.quizCount} quiz questions</p>`;
      break;
    case "lesson":
      html = `${eyebrow(`Section ${s.sectionIndex} · Lesson ${s.lessonIndex}`)}<h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.description ?? "")}</p>`;
      break;
    case "text":
      html = `${eyebrow(s.lessonTitle)}<p>${escapeHtml(s.content)}</p>`;
      break;
    case "video":
      html = `${eyebrow(s.lessonTitle)}<video class="lesson-video" controls preload="metadata" src="${escapeHtml(s.url)}"></video>`;
      break;
    case "section-block":
      html = `${eyebrow(s.lessonTitle)}${s.title ? `<h2>${escapeHtml(s.title)}</h2>` : ""}${s.content ? `<p>${escapeHtml(s.content)}</p>` : ""}${
        s.items?.length
          ? `<ul>${s.items.map((i) => `<li>${escapeHtml(i.content)}</li>`).join("")}</ul>`
          : ""
      }`;
      break;
    case "faq":
      html = `<div class="faq-slide">${eyebrow(s.lessonTitle)}<strong>${escapeHtml(s.question)}</strong><p>${escapeHtml(s.answer)}</p></div>`;
      break;
    case "quiz":
      html = `${eyebrow(`${s.topicTitle} · Quiz ${s.quizIndex}/${s.totalQuizzes}`)}<h2>${escapeHtml(s.question)}</h2><ul>${(s.options ?? []).map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>`;
      break;
    default:
      html = "<p>—</p>";
  }

  stage.innerHTML = html;
  stage.style.borderTop = `4px solid ${s.accent ?? "var(--accent)"}`;
}

$("slidePrev").addEventListener("click", () => goToSlide(slideIndex - 1));
$("slideNext").addEventListener("click", () => goToSlide(slideIndex + 1));

document.addEventListener("keydown", (e) => {
  if ($("viewWorkspace").classList.contains("hidden")) return;
  const tab = document.querySelector(".wtab.active")?.dataset.wtab;
  if (tab !== "studio") return;
  if (e.key === "ArrowLeft") goToSlide(slideIndex - 1);
  if (e.key === "ArrowRight") goToSlide(slideIndex + 1);
});

function renderLaunchSummary(plan) {
  const el = $("launchSummary");
  if (!plan?.module?.title) {
    el.innerHTML = "<p>No course loaded.</p>";
    return;
  }
  const lessons = plan.topics.reduce((n, t) => n + (t.contents?.length ?? 0), 0);
  el.innerHTML = `
    <dl>
      <dt>Module</dt><dd>${escapeHtml(plan.module.title)}</dd>
      <dt>Sections</dt><dd>${plan.topics.length}</dd>
      <dt>Lessons</dt><dd>${lessons}</dd>
      <dt>Slides</dt><dd>${slides.length}</dd>
    </dl>`;
}

function getCourseFromEditor() {
  return JSON.parse($("courseEditor").value);
}

/* —— AI chat commands —— */
$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) return;
  $("chatInput").value = "";
  addChat("user", text);
  handleChatCommand(text);
});

document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => handleChatCommand(btn.dataset.cmd));
});

function handleChatCommand(text) {
  const lower = text.toLowerCase();
  if (lower === "analyze" || lower.includes("analyze") || lower.includes("timeline")) {
    addChat("ai", "Starting video analysis — I'll segment topics and upload to CDN.");
    $("buildJourney").click();
    return;
  }
  if (lower === "generate" || lower.includes("generate") || lower.includes("lesson")) {
    addChat("ai", "Writing lessons from transcripts — this may take several minutes.");
    $("buildCourse").click();
    return;
  }
  if (lower === "preview" || lower.includes("preview") || lower.includes("viewer")) {
    setWorkspaceTab("studio");
    addChat("ai", "Opened the slide-by-slide course viewer. Use ← → keys to navigate.");
    return;
  }
  if (lower === "publish" || lower.includes("publish")) {
    setWorkspaceTab("launch");
    addChat("ai", "Ready to publish — review the summary and click Publish module.");
    return;
  }
  if (lower.includes("help")) {
    addChat(
      "ai",
      'Try: "analyze videos", "generate lessons", "open preview", or "publish". Quick buttons below work too.'
    );
    return;
  }
  addChat(
    "ai",
    `I heard: "${text}". Use analyze / generate / preview / publish, or the buttons on the right.`
  );
}

/* —— Actions —— */
$("loadDefaults").addEventListener("click", async () => {
  const { urls } = await api("/api/bootcamp/defaults");
  $("urls").value = urls.join("\n");
  if (!$("courseName").value.trim()) $("courseName").value = "3-Day Bootcamp Course";
});

$("buildJourney").addEventListener("click", async () => {
  if (!activeCourse) {
    addChat("ai", "Create or select a course first.");
    return;
  }
  const courseName = $("courseName").value.trim();
  const urls = $("urls").value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!courseName || !urls.length) {
    addChat("ai", "Add a course name and at least one YouTube URL.");
    return;
  }

  setBusy(true, "Analyzing videos with AI…");
  setStatus("Ingesting videos and building timeline…");
  addChat("ai", `Analyzing ${urls.length} video(s) — downloading, transcribing, segmenting topics.`);

  try {
    const data = await api("/api/journey/build", {
      method: "POST",
      body: JSON.stringify({ courseName, urls, courseId: activeCourse.id }),
    });
    journeyData = data.journey;
    $("journeyEditor").value = JSON.stringify(data.journey, null, 2);
    renderJourneyPreview(data.journey);
    await loadCourses();
    activeCourse = courses.find((c) => c.id === activeCourse.id);
    setWorkspaceTab("timeline");
    addChat("ai", `Timeline ready — ${data.journey.steps.length} steps mapped. Review sections, then generate lessons.`);
    setStatus(`Timeline saved\n${data.path}`);
  } catch (e) {
    addChat("ai", `Error: ${e.message}`);
    setStatus(`Error: ${e.message}`);
  } finally {
    setTimeout(() => setBusy(false), 400);
  }
});

$("saveJourney").addEventListener("click", async () => {
  try {
    const journey = getJourneyFromEditor();
    await api("/api/journey", { method: "PUT", body: JSON.stringify(journey) });
    journeyData = journey;
    renderJourneyPreview(journey);
    addChat("ai", "Timeline saved.");
  } catch (e) {
    addChat("ai", `Save failed: ${e.message}`);
  }
});

$("buildCourse").addEventListener("click", async () => {
  if (!activeCourse) return;
  setBusy(true, "AI is writing your course…");
  addChat("ai", "Generating structured lessons from video transcripts…");

  try {
    const journey = getJourneyFromEditor();
    const data = await api("/api/course/build", {
      method: "POST",
      body: JSON.stringify({ ...journey, courseId: activeCourse.id }),
    });
    setCoursePlan(data.plan);
    await loadCourses();
    setWorkspaceTab("studio");
    addChat("ai", `Course ready — ${data.plan.topics.length} sections, ${slides.length} slides. Browse in the viewer.`);
    setStatus(`Studio ready · ${data.path}`);
  } catch (e) {
    addChat("ai", `Generation failed: ${e.message}`);
    setStatus(`Error: ${e.message}`);
  } finally {
    setTimeout(() => setBusy(false), 400);
  }
});

$("saveCourse").addEventListener("click", async () => {
  try {
    const plan = getCourseFromEditor();
    await api("/api/draft", { method: "PUT", body: JSON.stringify({ plan }) });
    setCoursePlan(plan);
    addChat("ai", "Draft saved.");
  } catch (e) {
    addChat("ai", e.message);
  }
});

$("publish").addEventListener("click", async () => {
  if (!confirm("Publish this course to LetsUpgrade Admin?")) return;
  setBusy(true, "Publishing…");
  try {
    const plan = getCourseFromEditor();
    const data = await api("/api/publish", {
      method: "POST",
      body: JSON.stringify({ plan, courseId: activeCourse?.id }),
    });
    $("publishResult").textContent = `Published · Module ID: ${data.result.moduleId}`;
    $("publishResult").className = "publish-result ok";
    addChat("ai", `Published successfully. Module ID: ${data.result.moduleId}`);
    await loadCourses();
  } catch (e) {
    $("publishResult").textContent = e.message;
    $("publishResult").className = "publish-result err";
    addChat("ai", `Publish failed: ${e.message}`);
  } finally {
    setTimeout(() => setBusy(false), 400);
  }
});

/* —— Boot —— */
async function bootApp() {
  showApp();
  $("userLabel").textContent = currentUser?.displayName ?? "Admin";

  try {
    const cfg = await fetch("/api/auth/config").then((r) => r.json());
    $("loginHint").textContent = `Default login: ${cfg.defaultUsername} / courseloom (or STUDIO_PASSWORD in .env)`;
  } catch { /* ignore */ }

  const me = await api("/api/auth/me");
  currentUser = me.user;
  if (me.activeCourseId) setActiveCourseId(me.activeCourseId);

  await loadCourses();

  addChat(
    "ai",
    "Welcome to CourseLoom. I'm your AI studio assistant — pick a course, paste YouTube URLs, and say \"analyze videos\" when you're ready."
  );

  const id = getActiveCourseId();
  if (id && courses.some((c) => c.id === id)) {
    await openCourse(id);
  } else if (courses.length === 1) {
    await openCourse(courses[0].id);
  } else {
    setView("dashboard");
  }
}

async function init() {
  try {
    const cfg = await fetch("/api/auth/config").then((r) => r.json());
    $("loginUser").value = cfg.defaultUsername ?? "admin";
    $("loginHint").textContent = `Default: ${cfg.defaultUsername} / courseloom`;
  } catch { /* ignore */ }

  if (getToken()) {
    try {
      const me = await api("/api/auth/me");
      currentUser = me.user;
      await bootApp();
      return;
    } catch {
      setToken(null);
    }
  }
  showLogin();
}

init();
