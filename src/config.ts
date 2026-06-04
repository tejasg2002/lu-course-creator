import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const DEFAULT_ADMIN_ORIGIN =
  "https://letsupgrade-admin-client-q6eh6ut7o-lu-labs.vercel.app";

/** Normalize BASE_URL to always end with /api/v1 */
function resolveLuBaseUrl(): string {
  const raw = process.env.BASE_URL?.trim() || DEFAULT_ADMIN_ORIGIN;
  const withoutTrailing = raw.replace(/\/+$/, "");
  if (withoutTrailing.endsWith("/api/v1")) return withoutTrailing;
  return `${withoutTrailing}/api/v1`;
}

export const config = {
  luBaseUrl: resolveLuBaseUrl(),
  uploadUrl:
    process.env.UPLOAD_URL?.trim() ||
    "https://service.letsupgrade.in/v4/upload/file",
  luToken: () => required("X-API-KEY"),
  anthropicKey: () => required("ANTROPIC_API_KEY"),
  claudeModel: process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-4-20250514",
};
