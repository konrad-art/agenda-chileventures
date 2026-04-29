// Timezone helpers
// The host (Konrad) works in config.timezone (e.g. America/Santiago).
// Guests can be anywhere — we auto-detect their TZ from the browser and
// allow override via a dropdown. The calendar/slots stay anchored to
// host TZ; we render dual labels when guest TZ differs.

export const HOST_TZ_FALLBACK = "America/Santiago"

// Curated short list (most common TZs for our audience)
export const COMMON_TZS: { tz: string; label: string }[] = [
  { tz: "America/Santiago", label: "Santiago (Chile)" },
  { tz: "America/Buenos_Aires", label: "Buenos Aires" },
  { tz: "America/Sao_Paulo", label: "São Paulo" },
  { tz: "America/Bogota", label: "Bogotá" },
  { tz: "America/Lima", label: "Lima" },
  { tz: "America/Mexico_City", label: "Ciudad de México" },
  { tz: "America/New_York", label: "New York (EST/EDT)" },
  { tz: "America/Chicago", label: "Chicago (CST/CDT)" },
  { tz: "America/Denver", label: "Denver (MST/MDT)" },
  { tz: "America/Los_Angeles", label: "Los Angeles (PST/PDT)" },
  { tz: "Europe/Madrid", label: "Madrid" },
  { tz: "Europe/London", label: "London" },
  { tz: "Europe/Paris", label: "Paris" },
  { tz: "Europe/Berlin", label: "Berlin" },
  { tz: "Asia/Tokyo", label: "Tokyo" },
  { tz: "Asia/Shanghai", label: "Shanghai" },
  { tz: "Asia/Singapore", label: "Singapore" },
  { tz: "Asia/Dubai", label: "Dubai" },
  { tz: "Australia/Sydney", label: "Sydney" },
  { tz: "UTC", label: "UTC" },
]

// Lazy-loaded full list of all IANA timezones supported by the runtime.
let _allTzsCache: string[] | null = null
export function getAllTimezones(): string[] {
  if (_allTzsCache) return _allTzsCache
  const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  if (typeof intlAny.supportedValuesOf === "function") {
    _allTzsCache = intlAny.supportedValuesOf("timeZone")
    return _allTzsCache!
  }
  // Fallback: just return the short list
  _allTzsCache = COMMON_TZS.map((t) => t.tz)
  return _allTzsCache
}

// Auto-detect the browser/OS timezone. Returns HOST_TZ_FALLBACK if unavailable.
export function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz || HOST_TZ_FALLBACK
  } catch {
    return HOST_TZ_FALLBACK
  }
}

// Read the short timezone abbreviation (e.g. "PST", "CET") for a given IANA TZ
// at a given instant. Browsers vary, so we fall back to the IANA name itself.
export function tzAbbreviation(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(at)
    const part = parts.find((p) => p.type === "timeZoneName")
    return part?.value || tz
  } catch {
    return tz
  }
}

// Get the UTC offset in minutes for a given IANA TZ at a given instant.
function tzOffsetMinutes(tz: string, at: Date): number {
  // Format the instant in the target TZ as a parseable string, parse it as UTC,
  // diff against the original instant — that gives the offset.
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    const parts: Record<string, string> = {}
    for (const p of dtf.formatToParts(at)) parts[p.type] = p.value
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      parts.hour === "24" ? 0 : Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    )
    return Math.round((asUtc - at.getTime()) / 60000)
  } catch {
    return 0
  }
}

// Build a UTC Date instance representing a wall-clock moment in a given TZ.
// e.g. wallTimeInTzToDate(2026,4,14, 17, 0, "America/Santiago") returns the
// UTC instant for "April 14, 2026 17:00 in Santiago".
export function wallTimeInTzToDate(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  tz: string
): Date {
  // Naive UTC instant assuming the wall time is UTC, then adjust by the
  // offset of `tz` at that instant (DST-aware).
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const offset = tzOffsetMinutes(tz, utcGuess)
  return new Date(utcGuess.getTime() - offset * 60000)
}

// Format an instant in a target TZ. Uses Spanish locale, 24h.
export function formatInTz(
  instant: Date | string,
  tz: string,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false }
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant
  try {
    return new Intl.DateTimeFormat("es-CL", { ...opts, timeZone: tz }).format(d)
  } catch {
    return d.toISOString()
  }
}

// "17:00" formatted in given tz
export function formatTimeInTz(instant: Date | string, tz: string): string {
  return formatInTz(instant, tz, { hour: "2-digit", minute: "2-digit", hour12: false })
}

// Friendly label for a TZ (used in the selector when collapsed)
export function shortTzLabel(tz: string, at: Date = new Date()): string {
  const abbr = tzAbbreviation(tz, at)
  // Simplify common verbose abbreviations Chrome returns (e.g. "GMT-3")
  const city = tz.split("/").pop()?.replace(/_/g, " ") || tz
  // If abbr is just like "GMT-3" we render the city; otherwise show abbr
  if (/^GMT[+\-]/.test(abbr)) return `${city} (${abbr})`
  return `${city} (${abbr})`
}

// Two TZs equal? Normalize a bit (some browsers report "Etc/UTC" vs "UTC").
export function sameTz(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.replace(/^Etc\//, "") === b.replace(/^Etc\//, "")
}
