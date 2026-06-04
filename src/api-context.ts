import type { Request } from "express";
import { setActiveCourse, type Session } from "./auth.js";
import { resolveCourseId } from "./workspace-store.js";

export type AuthedRequest = Request & { studioSession: Session };

export function asAuthed(req: Request): AuthedRequest {
  return req as AuthedRequest;
}

export function courseIdFromRequest(req: AuthedRequest): string {
  const header = req.headers["x-course-id"];
  const fromHeader =
    typeof header === "string" ? header.trim() : undefined;
  const fromBody =
    typeof req.body?.courseId === "string"
      ? req.body.courseId.trim()
      : undefined;
  const fromQuery =
    typeof req.query?.courseId === "string"
      ? req.query.courseId.trim()
      : undefined;
  const requested = fromHeader || fromBody || fromQuery;
  const id = resolveCourseId(
    requested,
    req.studioSession.activeCourseId
  );
  setActiveCourse(req.studioSession.token, id);
  return id;
}
