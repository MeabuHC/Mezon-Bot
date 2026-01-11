import he from "he";

/**
 * Decode HTML entities in a string
 * Uses the 'he' library to handle all HTML entities (numeric, hex, and named)
 */
export function decodeHtmlEntities(text: string): string {
  return he.decode(text);
}

