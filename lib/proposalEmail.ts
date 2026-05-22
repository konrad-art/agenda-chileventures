// Email block builder for proposed-slot links.
// ---------------------------------------------------------------------------
// Generates two parallel renderings of the same proposal:
//   - HTML for Gmail/Apple Mail/Outlook (table layout, inline CSS, no images)
//   - text/plain fallback for mail clients that strip HTML
//
// The output is written to the system clipboard via ClipboardItem so the host
// can paste it into a Gmail compose window and the rich layout survives.
//
// Email rendering rules we follow:
// - Tables, not flex/grid (Outlook 2007+ uses Word's HTML engine)
// - Inline styles only (Gmail strips <style> tags in many cases)
// - No external assets — guests should see the layout offline
// - Buttons are <a> with bg/padding so they look tappable on mobile
// - Hard max width 520px so it doesn't blow up the compose box

import { tzAbbreviation } from './timezone'

const DAYS_ES_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS_ES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export interface BuildEmailOpts {
  /** Base URL of the proposal landing, e.g. https://agenda.chileventures.vc/p/SLUG */
  url: string
  /** ISO UTC datetimes (already sorted ascending). */
  slots: string[]
  /** IANA TZ the host operates in — used to format wall-clock labels. */
  hostTz: string
  /** Event type display name (e.g. "Catchup"). */
  eventTypeName: string
  /** Duration in minutes — surfaced in the email subject area. */
  duration: number
  /** Optional handwritten note from the host. Rendered above the buttons. */
  note?: string | null
  /** Optional full-calendar URL ("/{eventType}") for the "no me sirven" link. */
  fullBookingUrl?: string | null
}

interface FormattedSlot {
  iso: string
  /** "mié 20 may" */
  dayLabel: string
  /** "10:00" */
  timeLabel: string
}

// Cache one Intl.DateTimeFormat per TZ — constructor is one of the more expensive
// ops in V8 (ICU locale load) and we call this once per slot per email build.
const _slotDtfByTz = new Map<string, Intl.DateTimeFormat>()
function slotDtfFor(tz: string): Intl.DateTimeFormat {
  let dtf = _slotDtfByTz.get(tz)
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
    _slotDtfByTz.set(tz, dtf)
  }
  return dtf
}

// Format a UTC instant as wall-clock parts in `tz` using Spanish short labels.
// DOW is re-derived from a noon-UTC anchor so we don't depend on browser `es`
// short-weekday support.
function formatSlot(iso: string, tz: string): FormattedSlot {
  const d = new Date(iso)
  const parts: Record<string, string> = {}
  for (const p of slotDtfFor(tz).formatToParts(d)) parts[p.type] = p.value
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const dow = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()
  return {
    iso,
    dayLabel: `${DAYS_ES_SHORT[dow]} ${day} ${MONTHS_ES_SHORT[month - 1]}`,
    timeLabel: `${parts.hour}:${parts.minute}`,
  }
}

// Tiny HTML escaper for user-controlled fields (note, names).
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Build both renderings. Pure function — no DOM, no clipboard, no fetch. */
export function buildProposalEmail(opts: BuildEmailOpts): { html: string; text: string } {
  const { url, slots, hostTz, eventTypeName, duration, note, fullBookingUrl } = opts
  const formatted = slots.map((iso) => formatSlot(iso, hostTz))
  const tzAbbr = tzAbbreviation(hostTz, new Date(slots[0] || Date.now()))
  // "Santiago" out of "America/Santiago" — for the footer hint
  const tzCity = hostTz.split('/').pop()?.replace(/_/g, ' ') || hostTz

  // ─── HTML ─────────────────────────────────────────────────────────────
  const noteHtml = note && note.trim() !== ''
    ? `<p style="margin:0 0 14px 0; font-size:14px; line-height:1.5; color:#1a2438;">${esc(note.trim())}</p>`
    : ''

  // Prominent TZ banner above the slot list. Email clients strip JS so we
  // can't offer an interactive TZ converter inside the message itself —
  // instead we point at the landing page (the "Ver en tu zona horaria" link)
  // which DOES have a live selector.
  const tzBannerHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="border-collapse:collapse; max-width:360px; margin:0 0 12px 0;">
      <tr>
        <td align="left" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; font-weight:600; color:#1a2438;">
          🌎 Horarios en hora de ${esc(tzCity)} (${esc(tzAbbr)})
        </td>
        <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px;">
          <a href="${esc(url)}" target="_blank" rel="noopener noreferrer"
             style="color:#2d8cc2; text-decoration:none; font-weight:600;">
            Ver en tu zona →
          </a>
        </td>
      </tr>
    </table>`

  // Each slot row is an <a> wrapping a 2-cell table so the whole row is tappable.
  // Background + border-radius style it like a button.
  const slotRows = formatted.map((s, idx) => {
    const href = `${url}?t=${idx}`
    return `
      <tr><td style="padding:0 0 8px 0;">
        <a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
           style="display:block; text-decoration:none; color:#1a2438;
                  background:#f3f6fa; border:1px solid #d8e0ea; border-radius:10px;
                  padding:10px 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td align="left" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; font-weight:600; color:#1a2438;">
                ${esc(s.dayLabel)} &middot; ${esc(s.timeLabel)}
              </td>
              <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; font-weight:600; color:#2d8cc2;">
                Reservar &rarr;
              </td>
            </tr>
          </table>
        </a>
      </td></tr>`
  }).join('')

  const fullLinkHtml = fullBookingUrl
    ? `<p style="margin:14px 0 0 0; font-size:12px; color:#6b7280; line-height:1.5;">
         ¿No te sirve ninguna?
         <a href="${esc(fullBookingUrl)}" target="_blank" rel="noopener noreferrer"
            style="color:#2d8cc2; text-decoration:none;">Ver más horarios</a>
       </p>`
    : ''

  const tzHint = `<p style="margin:6px 0 0 0; font-size:11px; color:#9ca3af; line-height:1.5;">
    ${esc(eventTypeName)} &middot; ${duration} min
  </p>`

  // The slot rows table is narrower (360px) than the surrounding text (520px)
  // so the buttons feel like compact "menu items" instead of full-width bars.
  // Note: no signoff — the host signs the surrounding email manually.
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1a2438; max-width:520px;">
${noteHtml}${tzBannerHtml}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; max-width:360px;">
${slotRows}</table>${fullLinkHtml}${tzHint}</div>`

  // ─── Plain text fallback ─────────────────────────────────────────────
  const lines: string[] = []
  if (note && note.trim() !== '') {
    lines.push(note.trim())
    lines.push('')
  }
  lines.push(`🌎 Horarios en hora de ${tzCity} (${tzAbbr}). Ver en tu zona: ${url}`)
  lines.push('')
  formatted.forEach((s, idx) => {
    lines.push(`${idx + 1}. ${s.dayLabel} · ${s.timeLabel} → ${url}?t=${idx}`)
  })
  lines.push('')
  if (fullBookingUrl) {
    lines.push(`¿No te sirve ninguna? Ver más horarios: ${fullBookingUrl}`)
  }
  lines.push(`${eventTypeName} · ${duration} min`)

  return { html, text: lines.join('\n') }
}

/**
 * Write both HTML and text representations to the clipboard so pasting into
 * Gmail keeps the rich layout while pasting into a plaintext field (Slack,
 * Notes, terminal) shows the readable fallback.
 *
 * Returns true if at least the text portion got copied. Falls back to plain
 * text-only on browsers without ClipboardItem (rare in modern desktop).
 */
export async function copyProposalToClipboard(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      return true
    }
  } catch {
    // Fall through to text-only
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
