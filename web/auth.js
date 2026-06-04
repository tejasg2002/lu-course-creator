const TOKEN_KEY = "courseloom_token";
const COURSE_KEY = "courseloom_active_course";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getActiveCourseId() {
  return sessionStorage.getItem(COURSE_KEY);
}

export function setActiveCourseId(id) {
  if (id) sessionStorage.setItem(COURSE_KEY, id);
  else sessionStorage.removeItem(COURSE_KEY);
}

export function authHeaders(extra = {}) {
  const token = getToken();
  const courseId = getActiveCourseId();
  const headers = { "Content-Type": "application/json", ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (courseId) headers["X-Course-Id"] = courseId;
  return headers;
}

export async function api(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(path, {
    ...rest,
    headers: authHeaders(extraHeaders ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("courseloom:logout"));
    throw new Error("Session expired — sign in again");
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
