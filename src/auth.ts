import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export interface StudioUser {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "editor";
}

interface Session {
  token: string;
  user: StudioUser;
  activeCourseId: string | null;
  createdAt: number;
  expiresAt: number;
}

const sessions = new Map<string, Session>();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.STUDIO_SESSION_SECRET?.trim() ||
    "courseloom-dev-secret-change-in-production"
  );
}

export function defaultCredentials(): { username: string; password: string } {
  return {
    username: process.env.STUDIO_USERNAME?.trim() || "admin",
    password: process.env.STUDIO_PASSWORD?.trim() || "courseloom",
  };
}

export function login(username: string, password: string): Session | null {
  const creds = defaultCredentials();
  if (username !== creds.username || password !== creds.password) {
    return null;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const user: StudioUser = {
    id: "studio-admin",
    username: creds.username,
    displayName: "Course Studio Admin",
    role: "admin",
  };

  const session: Session = {
    token,
    user,
    activeCourseId: null,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  sessions.set(token, session);
  pruneExpiredSessions();
  return session;
}

export function logout(token: string): void {
  sessions.delete(token);
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(token);
  }
}

export function getSession(token: string | undefined): Session | null {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s;
}

export function setActiveCourse(token: string, courseId: string | null): void {
  const s = sessions.get(token);
  if (s) s.activeCourseId = courseId;
}

export function bearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.cookie;
  if (cookie) {
    const m = cookie.match(/courseloom_token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]!);
  }
  return undefined;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const session = getSession(bearerToken(req));
  if (!session) {
    res.status(401).json({ error: "Unauthorized — sign in required" });
    return;
  }
  (req as Request & { studioSession: Session }).studioSession = session;
  next();
}

export function signCookie(token: string): string {
  const sig = crypto
    .createHmac("sha256", sessionSecret())
    .update(token)
    .digest("hex")
    .slice(0, 16);
  return `${token}.${sig}`;
}

export function verifySignedCookie(value: string): string | null {
  const [token, sig] = value.split(".");
  if (!token || !sig) return null;
  const expected = crypto
    .createHmac("sha256", sessionSecret())
    .update(token)
    .digest("hex")
    .slice(0, 16);
  if (sig !== expected) return null;
  return token;
}
