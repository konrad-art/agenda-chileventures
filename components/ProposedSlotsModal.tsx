'use client'

// ProposedSlotsModal
// ---------------------------------------------------------------------------
// Admin-only modal that lets the host assemble a 2-5 slot proposal for an
// event type and generate a short URL to paste into an email. Phase 2 just
// returns the plain URL; Phase 3 will add HTML + clipboard write.
//
// Reuses the same availability + generateTimeSlots logic as BookingPage so
// the host can't accidentally propose times they're busy for. Slot wall-times
// are converted to UTC via wallTimeInTzToDate (host TZ-aware).

import { useState, useEffect, useMemo, useRef } from 'react'
import { Config, EventType, TimeSlot } from '@/lib/types'
import {
  generateTimeSlots, isDateAvailable, getCalendarDays,
  DAYS_ES, MONTHS_ES, isSameDay,
} from '@/lib/helpers'
import { wallTimeInTzToDate, HOST_TZ_FALLBACK } from '@/lib/timezone'
import { supabase } from '@/lib/supabase'
import { buildProposalEmail, copyProposalToClipboard } from '@/lib/proposalEmail'

interface BusySlot { start: string; end: string }

interface SelectedSlot {
  iso: string      // canonical ISO UTC (the value we POST)
  date: Date       // for display only
  slot: TimeSlot   // for display only
}

interface Props {
  eventType: EventType
  config: Config
  onClose: () => void
}

const MIN_SLOTS = 2
const MAX_SLOTS = 5
const DEFAULT_EXPIRES_DAYS = 7
const MAX_EXPIRES_DAYS = 14

function isSlotBusy(
  busy: BusySlot[], date: Date, slot: TimeSlot, duration: number, hostTz: string,
): boolean {
  const slotStart = wallTimeInTzToDate(
    date.getFullYear(), date.getMonth() + 1, date.getDate(),
    slot.hour, slot.minute, hostTz,
  )
  const slotEnd = new Date(slotStart.getTime() + duration * 60000)
  return busy.some((b) => {
    const bStart = new Date(b.start)
    const bEnd = new Date(b.end)
    return slotStart < bEnd && slotEnd > bStart
  })
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatSlotLabel(s: SelectedSlot): string {
  const day = DAYS_ES[s.date.getDay()].slice(0, 3).toLowerCase()
  const date = s.date.getDate()
  const month = MONTHS_ES[s.date.getMonth()].slice(0, 3).toLowerCase()
  return `${day} ${date} ${month} · ${s.slot.label}`
}

export default function ProposedSlotsModal({ eventType, config, onClose }: Props) {
  const hostTz = config.timezone || HOST_TZ_FALLBACK

  const [calMonth, setCalMonth] = useState<Date>(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([])
  const [monthBusyMap, setMonthBusyMap] = useState<Record<string, BusySlot[]>>({})
  // Days where every generated slot overlaps a busy block — disabled in the
  // calendar so the host can't waste a click on them.
  const [fullyBusyDates, setFullyBusyDates] = useState<Set<string>>(new Set())
  const [loadingDay, setLoadingDay] = useState(false)

  const [note, setNote] = useState('')
  const [expiresDays, setExpiresDays] = useState(DEFAULT_EXPIRES_DAYS)
  const [guestNameHint, setGuestNameHint] = useState('')
  const [guestEmailHint, setGuestEmailHint] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ slug: string; url: string; expires_at: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const modalRef = useRef<HTMLDivElement>(null)

  // Close on Esc, and lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Load month availability whenever the visible month changes.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/availability-month`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              year: calMonth.getFullYear(),
              month: calMonth.getMonth() + 1,
              event_type_id: eventType.id,
            }),
          },
        )
        const data = await res.json()
        if (cancelled) return
        const map: Record<string, BusySlot[]> = {}
        const fullyBusy = new Set<string>()
        const daysData: Record<string, BusySlot[]> = data.days || {}
        for (const [dateStr, busy] of Object.entries(daysData)) {
          const [y, m, d] = dateStr.split('-').map(Number)
          const key = `${y}-${m - 1}-${d}`
          map[key] = busy
          // Mark the day as fully busy if every generated slot collides with
          // a busy block. Days outside working_days have zero slots → also
          // fully busy by definition (and isDateAvailable already rejects them).
          const date = new Date(y, m - 1, d)
          const daySlots = generateTimeSlots(config, date, eventType.duration)
          if (daySlots.length > 0 && daySlots.every((s) => isSlotBusy(busy, date, s, eventType.duration, hostTz))) {
            fullyBusy.add(key)
          }
        }
        setMonthBusyMap((prev) => ({ ...prev, ...map }))
        setFullyBusyDates((prev) => {
          const next = new Set(prev)
          for (const k of fullyBusy) next.add(k)
          return next
        })
      } catch {
        /* ignore — host will see empty slots until retry */
      }
    }
    load()
    return () => { cancelled = true }
  }, [calMonth, eventType.id, eventType.duration, config, hostTz])

  // Refresh per-day data if it wasn't in the cached month payload (e.g. clicked
  // a day right after switching months and the month query hadn't returned yet).
  useEffect(() => {
    if (!selectedDate) return
    const key = dayKey(selectedDate)
    if (monthBusyMap[key]) return
    let cancelled = false
    async function load() {
      setLoadingDay(true)
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/availability`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: selectedDate!.toISOString(),
              event_type_id: eventType.id,
            }),
          },
        )
        const data = await res.json()
        if (cancelled) return
        setMonthBusyMap((prev) => ({ ...prev, [key]: data.busy || [] }))
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingDay(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedDate, eventType.id, monthBusyMap])

  const calendarDays = useMemo(() => getCalendarDays(calMonth), [calMonth])

  const daySlots = useMemo<TimeSlot[]>(() => {
    if (!selectedDate) return []
    return generateTimeSlots(config, selectedDate, eventType.duration)
  }, [selectedDate, config, eventType.duration])

  function toggleSlot(slot: TimeSlot) {
    if (!selectedDate) return
    const iso = wallTimeInTzToDate(
      selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate(),
      slot.hour, slot.minute, hostTz,
    ).toISOString().replace(/\.\d{3}Z$/, 'Z')

    setError(null)
    setSelectedSlots((prev) => {
      const existing = prev.findIndex((s) => s.iso === iso)
      if (existing >= 0) {
        return prev.filter((_, i) => i !== existing)
      }
      if (prev.length >= MAX_SLOTS) {
        setError(`Máximo ${MAX_SLOTS} horarios`)
        return prev
      }
      const next: SelectedSlot = { iso, date: new Date(selectedDate!), slot }
      return [...prev, next].sort((a, b) => a.iso.localeCompare(b.iso))
    })
  }

  function removeSlot(iso: string) {
    setSelectedSlots((prev) => prev.filter((s) => s.iso !== iso))
    setError(null)
  }

  function isPickedIso(iso: string): boolean {
    return selectedSlots.some((s) => s.iso === iso)
  }

  async function handleSubmit() {
    setError(null)
    if (selectedSlots.length < MIN_SLOTS) {
      setError(`Elige al menos ${MIN_SLOTS} horarios`)
      return
    }
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Sesión expirada. Vuelve a iniciar sesión.')
        setSubmitting(false)
        return
      }
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/proposed-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            event_type_id: eventType.id,
            slots: selectedSlots.map((s) => s.iso),
            note: note.trim() || undefined,
            guest_name_hint: guestNameHint.trim() || undefined,
            guest_email_hint: guestEmailHint.trim() || undefined,
            expires_in_days: expiresDays,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'No se pudo crear el link')
      } else {
        setResult(data)
      }
    } catch {
      setError('Error de red. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCopyUrl() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('No se pudo copiar al portapapeles')
    }
  }

  // Build the HTML/plain-text email pair once `result` is ready. Memoized so
  // the iframe preview doesn't rebuild on every render.
  const emailBlock = useMemo(() => {
    if (!result) return null
    const fullBookingUrl =
      typeof window !== 'undefined' ? `${window.location.origin}/${eventType.id}` : null
    return buildProposalEmail({
      url: result.url,
      slots: selectedSlots.map((s) => s.iso),
      hostTz,
      eventTypeName: eventType.name,
      duration: eventType.duration,
      note: note.trim() || null,
      fullBookingUrl,
    })
  }, [result, selectedSlots, hostTz, eventType.id, eventType.name, eventType.duration, note])

  const [copiedRich, setCopiedRich] = useState(false)

  async function handleCopyEmail() {
    if (!emailBlock) return
    const ok = await copyProposalToClipboard(emailBlock.html, emailBlock.text)
    if (ok) {
      setCopiedRich(true)
      setTimeout(() => setCopiedRich(false), 2000)
    } else {
      setError('No se pudo copiar. Intenta de nuevo.')
    }
  }

  // ─── Render ───
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 animate-fade-in"
      style={{ background: 'rgba(15, 24, 38, 0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-[860px] max-h-[92vh] flex flex-col rounded-[20px] overflow-hidden animate-scale-in"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-xl, 0 24px 60px rgba(15,24,38,0.25))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-xl">{eventType.emoji}</div>
            <div className="min-w-0">
              <div className="font-semibold text-[15px] truncate">Propuesta de horarios · {eventType.name}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {eventType.duration} min · {hostTz}
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="w-9 h-9 rounded-[10px] cursor-pointer border-none bg-transparent flex items-center justify-center hover:bg-[var(--surface-alt)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        {!result ? (
          <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Calendar + slots */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                  className="w-8 h-8 rounded-[8px] cursor-pointer border-none bg-transparent flex items-center justify-center hover:bg-[var(--surface-alt)]"
                  aria-label="Mes anterior"
                >‹</button>
                <div className="text-sm font-semibold">
                  {MONTHS_ES[calMonth.getMonth()]} {calMonth.getFullYear()}
                </div>
                <button
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                  className="w-8 h-8 rounded-[8px] cursor-pointer border-none bg-transparent flex items-center justify-center hover:bg-[var(--surface-alt)]"
                  aria-label="Mes siguiente"
                >›</button>
              </div>

              {/* Day header */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                  <div key={i} className="text-center text-[10px] font-semibold py-1" style={{ color: 'var(--text-tertiary)' }}>{d}</div>
                ))}
              </div>

              {/* Days */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((cd, i) => {
                  const date = new Date(calMonth.getFullYear(), cd.month, cd.day)
                  const dateInRange = !cd.otherMonth && isDateAvailable(config, date)
                  const key = dayKey(date)
                  const isFullyBusy = fullyBusyDates.has(key)
                  const available = dateInRange && !isFullyBusy
                  const isSelected = selectedDate ? isSameDay(date, selectedDate) : false
                  const hasPick = selectedSlots.some((s) => isSameDay(s.date, date))
                  return (
                    <button
                      key={i}
                      disabled={!available}
                      onClick={() => setSelectedDate(date)}
                      title={isFullyBusy ? 'Sin horarios disponibles' : undefined}
                      className={`aspect-square text-xs rounded-[8px] cursor-pointer border ${available ? 'hover:bg-[var(--surface-alt)]' : 'cursor-not-allowed opacity-30'} ${isSelected ? 'border-[var(--accent)]' : 'border-transparent'}`}
                      style={{
                        color: cd.otherMonth ? 'var(--text-tertiary)' : 'var(--text)',
                        background: isSelected ? 'var(--accent-light)' : hasPick ? 'rgba(45,140,194,0.06)' : 'transparent',
                        fontWeight: hasPick || isSelected ? 600 : 400,
                        textDecoration: isFullyBusy && dateInRange ? 'line-through' : undefined,
                      }}
                    >
                      {cd.day}
                      {hasPick && <div className="w-1 h-1 rounded-full mx-auto mt-[-2px]" style={{ background: 'var(--accent)' }} />}
                    </button>
                  )
                })}
              </div>

              {/* Day slots */}
              <div className="mt-4">
                {selectedDate ? (
                  <>
                    <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Horarios {DAYS_ES[selectedDate.getDay()].toLowerCase()} {selectedDate.getDate()} {MONTHS_ES[selectedDate.getMonth()].toLowerCase()}
                    </div>
                    {loadingDay && !monthBusyMap[dayKey(selectedDate)] ? (
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Cargando…</div>
                    ) : daySlots.length === 0 ? (
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No hay horarios este día</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {daySlots.map((slot) => {
                          const iso = wallTimeInTzToDate(
                            selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate(),
                            slot.hour, slot.minute, hostTz,
                          ).toISOString().replace(/\.\d{3}Z$/, 'Z')
                          const busy = isSlotBusy(monthBusyMap[dayKey(selectedDate)] || [], selectedDate, slot, eventType.duration, hostTz)
                          const picked = isPickedIso(iso)
                          return (
                            <button
                              key={slot.label}
                              disabled={busy}
                              onClick={() => toggleSlot(slot)}
                              className={`text-xs px-2.5 py-1.5 rounded-[8px] border cursor-pointer transition-all ${busy ? 'cursor-not-allowed' : ''}`}
                              style={{
                                background: picked ? 'var(--accent)' : busy ? 'var(--surface-alt)' : 'var(--surface)',
                                color: picked ? '#fff' : busy ? 'var(--text-tertiary)' : 'var(--text)',
                                borderColor: picked ? 'var(--accent)' : 'var(--border)',
                                textDecoration: busy ? 'line-through' : 'none',
                                opacity: busy ? 0.5 : 1,
                              }}
                              title={busy ? 'No disponible' : picked ? 'Quitar' : 'Agregar'}
                            >
                              {slot.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Selecciona un día en el calendario
                  </div>
                )}
              </div>
            </div>

            {/* Right column: selected + form */}
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Seleccionados ({selectedSlots.length} / {MAX_SLOTS})
                  </div>
                  {selectedSlots.length > 0 && (
                    <button
                      onClick={() => setSelectedSlots([])}
                      className="text-xs cursor-pointer border-none bg-transparent hover:underline"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                {selectedSlots.length === 0 ? (
                  <div className="text-xs px-3 py-3 rounded-[10px] text-center" style={{ background: 'var(--surface-alt)', color: 'var(--text-tertiary)' }}>
                    Elige entre {MIN_SLOTS} y {MAX_SLOTS} horarios del calendario
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {selectedSlots.map((s) => (
                      <div key={s.iso} className="flex items-center justify-between px-3 py-2 rounded-[10px]"
                        style={{ background: 'var(--surface-alt)' }}>
                        <span className="text-xs font-medium">{formatSlotLabel(s)}</span>
                        <button onClick={() => removeSlot(s.iso)} aria-label="Quitar"
                          className="w-5 h-5 rounded-full cursor-pointer border-none flex items-center justify-center hover:bg-[var(--border)]"
                          style={{ background: 'transparent', color: 'var(--text-tertiary)' }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Nota (opcional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="Te dejo unas opciones, dime si alguna te acomoda…"
                  className="form-input w-full text-sm resize-none"
                />
                <div className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-tertiary)' }}>
                  {note.length}/500
                </div>
              </div>

              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs cursor-pointer border-none bg-transparent text-left flex items-center gap-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span style={{ display: 'inline-block', transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0)' }}>▸</span>
                Más opciones
              </button>

              {showAdvanced && (
                <div className="flex flex-col gap-3 px-3 py-3 rounded-[10px]" style={{ background: 'var(--surface-alt)' }}>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Expira en
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} max={MAX_EXPIRES_DAYS}
                        value={expiresDays}
                        onChange={(e) => {
                          const n = parseInt(e.target.value)
                          if (Number.isFinite(n)) setExpiresDays(Math.max(1, Math.min(MAX_EXPIRES_DAYS, n)))
                        }}
                        className="form-input !w-[80px] text-sm"
                      />
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        días (máx {MAX_EXPIRES_DAYS})
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Nombre del invitado (opcional)
                    </label>
                    <input
                      type="text" value={guestNameHint}
                      onChange={(e) => setGuestNameHint(e.target.value.slice(0, 100))}
                      placeholder="Para prellenar el form"
                      className="form-input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Email del invitado (opcional)
                    </label>
                    <input
                      type="email" value={guestEmailHint}
                      onChange={(e) => setGuestEmailHint(e.target.value.slice(0, 254))}
                      placeholder="Para prellenar el form"
                      className="form-input w-full text-sm"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs px-3 py-2 rounded-[8px]" style={{ background: 'var(--error-light)', color: 'var(--error)' }}>
                  {error}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Success view: preview + clipboard write (HTML + text) */
          <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--accent-light)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <div className="text-base font-semibold">Propuesta lista</div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Expira el {new Date(result.expires_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
                  &nbsp;·&nbsp;{selectedSlots.length} horarios
                </div>
              </div>
            </div>

            {/* Email preview — uses srcDoc on an iframe so the inline styles
                render in isolation from the app's CSS. Approximates how Gmail
                will show it. */}
            {emailBlock && (
              <div className="mb-4">
                <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Vista previa
                </div>
                <iframe
                  title="Vista previa del email"
                  srcDoc={`<!doctype html><html><body style="margin:0;padding:16px;background:#fff;">${emailBlock.html}</body></html>`}
                  sandbox=""
                  className="w-full rounded-[12px] border"
                  style={{ borderColor: 'var(--border)', background: '#fff', height: 280 }}
                />
              </div>
            )}

            {/* Primary action: paste-into-Gmail (HTML + text) */}
            <button
              onClick={handleCopyEmail}
              className="w-full btn-primary text-sm !py-3 mb-2 inline-flex items-center justify-center gap-2"
            >
              {copiedRich ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ¡Copiado! Ahora pega en Gmail (Cmd+V)
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar para Gmail
                </>
              )}
            </button>

            {/* Secondary: just the URL, for cases where you want to share the
                bare link (e.g. WhatsApp, SMS, internal note). */}
            <details className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <summary className="cursor-pointer select-none py-1">Solo necesito el link</summary>
              <div className="flex items-stretch gap-2 mt-2">
                <input
                  readOnly value={result.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="form-input flex-1 text-xs font-mono"
                  style={{ background: 'var(--surface-alt)' }}
                />
                <button onClick={handleCopyUrl} className="btn-sm">
                  {copied ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
            </details>

            {error && (
              <div className="text-xs px-3 py-2 rounded-[8px] mt-3" style={{ background: 'var(--error-light)', color: 'var(--error)' }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!result && (
          <div className="px-5 sm:px-7 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
            <button onClick={onClose} className="btn-sm">Cancelar</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || selectedSlots.length < MIN_SLOTS}
              className="btn-primary text-sm !py-2.5 !px-5"
              style={{ opacity: submitting || selectedSlots.length < MIN_SLOTS ? 0.6 : 1 }}
            >
              {submitting ? 'Creando…' : 'Generar link'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
