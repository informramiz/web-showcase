/**
 * Turns free text from the search box into a safe FTS5 MATCH expression.
 *
 * Every whitespace-separated word becomes a quoted phrase with a prefix wildcard ("log"* matches "login"), and
 * the phrases are ANDed. Quoting means user input can never be read as FTS5 syntax (AND, NEAR, column filters,
 * parentheses), so a stray quote or operator can't cause a syntax error. Returns null when nothing searchable
 * is left, which callers treat as "no results" rather than "no filter".
 * https://www.sqlite.org/fts5.html#full_text_query_syntax
 */
export function toFtsQuery(input: string): string | null {
  const terms = input
    .split(/\s+/)
    // Keep only characters the unicode61 tokenizer indexes; everything else is a separator to it anyway.
    .map((word) => word.replace(/[^\p{L}\p{N}]+/gu, " ").trim())
    .filter((word) => word.length > 0);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(" ");
}
