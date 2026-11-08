/**
 * `attachment` disposition with an ASCII fallback name and the RFC 6266 / RFC 5987 UTF-8 form, so browsers
 * always download (never render) the file and keep non-ASCII names intact.
 */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRFC5987(name)}`;
}

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
