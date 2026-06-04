# CourseLoom — AI Course Studio

Industry-ready studio to turn YouTube bootcamps into LetsUpgrade modules — with **login**, **multi-course library**, **AI assistant**, and a **slide-by-slide course viewer**.

## Setup

```bash
npm install
cp .env.example .env
# Add X-API-KEY, ANTROPIC_API_KEY, and optional STUDIO_USERNAME / STUDIO_PASSWORD
brew install yt-dlp ffmpeg
npm run dev
```

Open **http://localhost:3789**

## Studio login (default)

| Field | Default |
|-------|---------|
| Username | `admin` (or `STUDIO_USERNAME` in `.env`) |
| Password | `courseloom` (or `STUDIO_PASSWORD` in `.env`) |

Change these in `.env` before sharing the studio on a network.

## Product flow

1. **Library** — Create and open multiple courses; each has its own timeline and draft under `data/workspaces/`.
2. **AI Assistant** — Chat-style panel; say *analyze videos*, *generate lessons*, *open preview*, or use quick actions.
3. **Timeline** — AI-mapped sections from transcript + CDN clips.
4. **Course Viewer** — Slide-by-slide deck (sections → lessons → content blocks → quizzes); ← → to navigate.
5. **Publish** — Push the module to LetsUpgrade Admin.

Legacy `output/course-journey.json` is imported into the library on first run if present.

## Env

| Variable | Purpose |
|----------|---------|
| `STUDIO_USERNAME` / `STUDIO_PASSWORD` | Studio login |
| `SESSION_SECRET` | Session signing (production) |
| `X-API-KEY` | LU JWT (publish + CDN upload) |
| `ANTROPIC_API_KEY` | Claude (journey + course text) |
| `UPLOAD_URL` | `https://service.letsupgrade.in/v4/upload/file` |

## CLI (optional)

```bash
npm run create -- "Text-only course topic"
npm run upload -- ./thumb.png modules
```
