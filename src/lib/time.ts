/** Formats a time like "12:33 PM" in the given IANA time zone. */
export function formatLocalTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
