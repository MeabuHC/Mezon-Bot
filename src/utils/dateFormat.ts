/**
 * Format a date to a short format (e.g., "Jan 5") in local timezone.
 */
export function formatShortDate(dateHeader: string | number | Date): string {
  if (!dateHeader) return "";
  const date = new Date(dateHeader);
  if (Number.isNaN(date.getTime())) return String(dateHeader);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a full date and time in local timezone.
 */
export function formatFullDateTime(value: string | number | Date): string {
  try {
    const date =
      value instanceof Date ? value : new Date(typeof value === "number" ? value : Date.parse(value));

    if (Number.isNaN(date.getTime())) {
      return "Unknown date";
    }

    return date.toLocaleString();
  } catch {
    return "Unknown date";
  }
}

/**
 * Format email date (alias for formatFullDateTime for compatibility).
 */
export function formatEmailDate(value: string | number | Date): string {
  return formatFullDateTime(value);
}

