/** 5 MB: enough for screenshots and PDFs, small enough to buffer in a Worker (128 MB memory limit). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Types a task board needs. Anything else (HTML, SVG, executables) is rejected, and downloads are always
 * served as attachments with nosniff, so a mislabelled file is never rendered inline by the browser.
 */
export const ALLOWED_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
]);

export const MAX_NAME_LENGTH = 200;

/** Drops any path, control characters and quotes, and caps the length. The name is display-only. */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

/** "text/plain; charset=utf-8" -> "text/plain". */
export function baseContentType(raw: string): string {
  return (raw.split(";")[0] ?? "").trim().toLowerCase();
}
