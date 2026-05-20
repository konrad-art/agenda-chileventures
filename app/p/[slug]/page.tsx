'use client'

// Landing page for proposed-slot email links.
// ---------------------------------------------------------------------------
// /p/{slug}            → selection view: lists all proposed slots, click one
// /p/{slug}?t={idx}    → booking form with that slot pre-selected (via BookingPage)
//
// The slug acts as a capability token (no auth needed; whoever has the URL
// can see the proposal). The edge function GET /proposed-link?slug=... pulls
// the proposal + the event type details in one shot.

import { useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { EventType } from '@/lib/types'
import BookingPage, { PreselectedSlot } from '@/components/BookingPage'
import { CVLogoFull } from '@/components/CVLogo'
import TimezoneSelector from '@/components/TimezoneSelector'
import {
  detectTimezone, formatTimeInTz, sameTz, HOST_TZ_FALLBACK,
} from '@/lib/timezone'

const TZ_STORAGE_KEY = 'agenda_guest_tz_v1'

interface ProposalData {
  slug: string
  event_type: EventType | null
  event_type_active: boolean
  slots: string[]           // ISO UTC
  note: string | null
  guest_name_hint: string | null
  guest_email_hint: string | null
  expires_at: string
  used_booking_id: string | null
  expired: boolean
}

const DAYS_ES_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS_ES_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Spanish "weekday day month" label in a given TZ
function formatDateLabel(iso: string, tz: string): string {
  const d = new Date(iso)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(d)) parts[p.type] = p.value
  const y = Number(parts.year), m = Number(parts.month), day = Number(parts.day)
  // Reconstruct DOW at noon UTC anchored on the same wall date
  const dow = new Date(Date.UTC(y, m - 1, day, 12)).getUTCDay()
  return `${DAYS_ES_LONG[dow]} ${day} de ${MONTHS_ES_LONG[m - 1]}`
}

export default function ProposedSlotLandingPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const slug = params.slug as string
  const tIdxParam = searchParams.get('t')
  const tIdx = tIdxParam !== null ? parseInt(tIdxParam, 10) : null

  const [data, setData] = useState<ProposalData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Guest TZ — auto-detected, persisted across pages, overridable in the selector.
  const [guestTz, setGuestTz] = useState<string>(HOST_TZ_FALLBACK)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(TZ_STORAGE_KEY)
      setGuestTz(stored || detectTimezone())
    } catch {
      setGuestTz(detectTimezone())
    }
  }, [])
  function handleTzChange(tz: string) {
    setGuestTz(tz)
    try { localStorage.setItem(TZ_STORAGE_KEY, tz) } catch { /* ignore quota */ }
  }

  // Fetch the proposal once on mount.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/proposed-link?slug=${encodeURIComponent(slug)}`,
        )
        if (!res.ok) {
          if (cancelled) return
          if (res.status === 404) setError('Este link de horarios no existe o fue eliminado.')
          else setError('No se pudo cargar la propuesta.')
          setLoading(false)
          return
        }
        const payload = await res.json()
        if (cancelled) return
        setData(payload)
        setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Error de conexión.')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [slug])

  const hostTz = HOST_TZ_FALLBACK  // proposed-link payload doesn't ship config; default to host TZ
  const tzDiffer = !sameTz(guestTz, hostTz)

  // Selected slot when ?t= is present and valid.
  const selectedPreselect: PreselectedSlot | null = useMemo(() => {
    if (!data || tIdx === null) return null
    if (Number.isNaN(tIdx) || tIdx < 0 || tIdx >= data.slots.length) return null
    if (!data.event_type) return null
    return {
      datetime: data.slots[tIdx],
      eventTypeId: data.event_type.id,
      proposedLinkSlug: data.slug,
      guestNameHint: data.guest_name_hint,
      guestEmailHint: data.guest_email_hint,
    }
  }, [data, tIdx])

  // ─── Loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
        <div className="card p-6 max-w-md w-full">
          <div className="skeleton h-6 w-[60%] rounded-md mb-3" />
          <div className="skeleton h-4 w-[40%] rounded-md mb-6" />
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full rounded-[10px]" />)}
          </div>
        </div>
      </div>
    )
  }

  // ─── Error / expired / used / inactive ──────────────────────────────
  if (error || !data || data.expired || data.used_booking_id || !data.event_type_active || !data.event_type) {
    let title = 'Link no disponible'
    let message: string = error || 'Este link de horarios ya no está disponible.'
    if (data?.expired) {
      title = 'Link expirado'
      message = 'Este link de horarios ya expiró. Pídele al organizador que te envíe uno nuevo.'
    } else if (data?.used_booking_id) {
      title = 'Horario ya reservado'
      message = 'Alguien ya reservó un horario con este link.'
    } else if (data && !data.event_type_active) {
      title = 'Tipo de cita inactivo'
      message = 'El tipo de cita asociado a este link ya no está activo.'
    }
    const fallbackHref = data?.event_type?.id ? `/${data.event_type.id}` : '/'
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
        <div className="card p-6 sm:p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-5"><CVLogoFull height={18} /></div>
          <div className="text-lg font-semibold mb-2">{title}</div>
          <div className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>{message}</div>
          <a href={fallbackHref} className="btn-primary inline-block !py-2.5">
            Ver horarios disponibles
          </a>
        </div>
      </div>
    )
  }

  // ─── Booking form (slot pre-selected via ?t=N) ──────────────────────
  if (selectedPreselect) {
    return <BookingPage preselectedSlot={selectedPreselect} />
  }

  // ─── Selection view (no ?t=, or invalid index) ──────────────────────
  const et = data.event_type
  return (
    <div className="min-h-screen mesh-bg">
      <div className="sticky top-0 z-50 floating-nav mx-2 sm:mx-4 mt-2 sm:mt-4 rounded-2xl px-4 sm:px-6 py-3 sm:py-3.5">
        <CVLogoFull height={16} />
      </div>

      <div className="max-w-[680px] mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="text-3xl w-14 h-14 flex items-center justify-center rounded-[16px]" style={{ background: 'var(--surface-alt)' }}>
            {et.emoji}
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-display" style={{ letterSpacing: '-0.3px' }}>{et.name}</div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{et.duration} min &middot; Elige un horario</div>
          </div>
        </div>

        {data.note && (
          <div className="card p-4 mb-5 text-sm leading-relaxed" style={{ background: 'var(--surface-alt)', borderLeft: '3px solid var(--accent)' }}>
            {data.note}
          </div>
        )}

        {/* TZ selector */}
        <div className="flex items-center gap-2 mb-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>Mostrando horarios en:</span>
          <TimezoneSelector value={guestTz} onChange={handleTzChange} hostTz={hostTz} />
        </div>

        {/* Slot list */}
        <div className="flex flex-col gap-2.5">
          {data.slots.map((iso, idx) => {
            const dateLabel = formatDateLabel(iso, guestTz)
            const timeGuest = formatTimeInTz(iso, guestTz)
            const timeHost = formatTimeInTz(iso, hostTz)
            return (
              <button
                key={iso}
                onClick={() => router.push(`/p/${slug}?t=${idx}`)}
                className="text-left p-4 sm:p-5 rounded-[14px] border-2 transition-all hover:shadow-md hover:-translate-y-0.5"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[15px] capitalize">{dateLabel}</div>
                    <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {timeGuest}
                      {tzDiffer && (
                        <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          ({timeHost} hora de Santiago)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                    Reservar
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Fallback link */}
        <div className="text-center mt-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          ¿No te sirve ninguna? <a href={`/${et.id}`} className="hover:underline" style={{ color: 'var(--accent)' }}>Ver todos los horarios</a>
        </div>

        {/* Expiration footer */}
        <div className="text-center mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Link válido hasta el {new Date(data.expires_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}
