'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Config, EventType, Booking, TimeSlot } from '@/lib/types'
import { DAYS_ES, MONTHS_ES, generateTimeSlots, isSameDay, isDateAvailable, getCalendarDays } from '@/lib/helpers'
import { CVLogoFull, CVMark } from '@/components/CVLogo'

interface BusySlot {
  start: string
  end: string
}

function isSlotBusy(busySlots: BusySlot[], date: Date, slot: TimeSlot, duration: number): boolean {
  const slotStart = new Date(date)
  slotStart.setHours(slot.hour, slot.minute, 0, 0)
  const slotEnd = new Date(slotStart.getTime() + duration * 60000)
  return busySlots.some((b) => {
    const bStart = new Date(b.start)
    const bEnd = new Date(b.end)
    return slotStart < bEnd && slotEnd > bStart
  })
}

/* ─── Skeleton Components ─── */
function SkeletonSidebar() {
  return (
    <div className="p-5 sm:p-8 border-b md:border-b-0 md:border-r flex flex-col gap-4 sm:gap-6" style={{ borderColor: 'var(--border)' }}>
      <div className="skeleton w-[52px] h-[52px] rounded-[14px]" />
      <div>
        <div className="skeleton h-5 w-[140px] mb-2" />
        <div className="skeleton h-4 w-[100px] mb-1.5" />
        <div className="skeleton h-3 w-[120px]" />
      </div>
      <div className="h-px" style={{ background: 'var(--border)' }} />
      <div className="skeleton h-3 w-[100px]" />
      <div className="flex flex-col gap-2.5">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton h-[76px] w-full rounded-[14px]" />
        ))}
      </div>
    </div>
  )
}

function SkeletonCalendar() {
  return (
    <div className="p-5 sm:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="skeleton h-6 w-[160px] rounded-lg" />
        <div className="flex gap-1.5">
          <div className="skeleton w-9 h-9 rounded-[10px]" />
          <div className="skeleton w-9 h-9 rounded-[10px]" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={`h-${i}`} className="skeleton h-4 w-full rounded-md" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="skeleton h-10 w-full rounded-[12px]" style={{ animationDelay: `${i * 20}ms` }} />
        ))}
      </div>
      <div className="skeleton h-3 w-[120px] mb-3 rounded-md" />
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton h-[46px] w-full rounded-[14px]" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    </div>
  )
}

interface Props {
  filterType?: string
  rescheduleToken?: string
}

export default function BookingPage({ filterType, rescheduleToken }: Props) {
  const [config, setConfig] = useState<Config | null>(null)
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedType, setSelectedType] = useState<EventType | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [calMonth, setCalMonth] = useState(new Date())
  const [step, setStep] = useState<'type' | 'date' | 'form' | 'success'>('type')

  const [formData, setFormData] = useState({ name: '', email: '', notes: '' })
  const [extraData, setExtraData] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [meetLink, setMeetLink] = useState<string | null>(null)

  const [busySlots, setBusySlots] = useState<BusySlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [rescheduleData, setRescheduleData] = useState<any>(null)
  const [rescheduleError, setRescheduleError] = useState('')

  // Month-level availability: dates with no free slots are disabled in the calendar
  const [monthBusyMap, setMonthBusyMap] = useState<Record<string, BusySlot[]>>({})
  const [fullyBookedDates, setFullyBookedDates] = useState<Set<string>>(new Set())
  const [loadingMonth, setLoadingMonth] = useState(false)

  const isReschedule = !!rescheduleToken

  // Load data from Supabase
  useEffect(() => {
    async function load() {
      const [configRes, typesRes] = await Promise.all([
        supabase.from('config').select('id, name, title, org, timezone, working_days, start_hour, end_hour, buffer_minutes, max_days_ahead, day_schedules').single(),
        supabase.from('event_types').select('id, name, emoji, duration, description, extra_fields, sort_order').order('sort_order'),
      ])
      if (configRes.data) setConfig(configRes.data)
      if (typesRes.data) {
        setEventTypes(typesRes.data)
        if (filterType) {
          const match = typesRes.data.find((t: EventType) => t.id === filterType)
          if (match) {
            setSelectedType(match)
            setStep('date')
          }
        }
      }
      setLoading(false)
    }
    load()
  }, [filterType])

  // Load reschedule booking data
  useEffect(() => {
    if (!rescheduleToken || eventTypes.length === 0) return
    async function loadReschedule() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reschedule?token=${rescheduleToken}`
        )
        const data = await res.json()
        if (!res.ok || data.error) {
          setRescheduleError(data.error || 'Enlace inválido')
          setLoading(false)
          return
        }
        setRescheduleData(data.booking)
        // Reschedule GET only returns event_type_id/datetime/duration (no PII). The
        // server already has the booking's name/email/notes by token and reuses them
        // on POST, so we don't hydrate formData here.
        const match = eventTypes.find((t: EventType) => t.id === data.booking.event_type_id)
        if (match) {
          setSelectedType(match)
          setStep('date')
        }
      } catch {
        setRescheduleError('Error al cargar los datos de la reunión')
      }
    }
    loadReschedule()
  }, [rescheduleToken, eventTypes])

  // Fetch availability for all working days via single bulk endpoint
  useEffect(() => {
    if (!selectedType || !config || step === 'type' || step === 'success') return

    const currentConfig = config
    const currentType = selectedType
    let cancelled = false

    async function fetchMonthAvailability() {
      setLoadingMonth(true)
      const year = calMonth.getFullYear()
      const month = calMonth.getMonth() + 1 // 1-based for the API

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/availability-month`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, month, event_type_id: currentType.id }),
          }
        )
        if (!res.ok) {
          console.error('availability-month returned', res.status)
          setMonthBusyMap({})
          setFullyBookedDates(new Set())
          setLoadingMonth(false)
          return
        }
        const data = await res.json()
        if (cancelled) return

        // Convert API response { days: { "YYYY-MM-DD": [...busy] } }
        // into the internal busyMap keyed by "year-month-day" (0-based month)
        const busyMap: Record<string, BusySlot[]> = {}
        const daysData: Record<string, BusySlot[]> = data.days || {}

        for (const [dateStr, busy] of Object.entries(daysData)) {
          const [y, m, d] = dateStr.split('-').map(Number)
          const key = `${y}-${m - 1}-${d}` // month is 0-based in the internal key
          busyMap[key] = busy
        }

        // Determine which dates are fully booked
        const fullyBooked = new Set<string>()
        for (const [dateStr, busy] of Object.entries(daysData)) {
          const [y, m, d] = dateStr.split('-').map(Number)
          const key = `${y}-${m - 1}-${d}`
          const date = new Date(y, m - 1, d)
          const slots = generateTimeSlots(currentConfig, date, currentType.duration)
          if (slots.length === 0) {
            fullyBooked.add(key)
            continue
          }
          const allBusy = slots.every(slot => isSlotBusy(busy, date, slot, currentType.duration))
          if (allBusy) fullyBooked.add(key)
        }

        setMonthBusyMap(busyMap)
        setFullyBookedDates(fullyBooked)
      } catch (err) {
        console.error('Failed to fetch month availability:', err)
        setMonthBusyMap({})
        setFullyBookedDates(new Set())
      }
      setLoadingMonth(false)
    }

    fetchMonthAvailability()
    return () => { cancelled = true }
  }, [selectedType?.id, calMonth.getMonth(), calMonth.getFullYear(), config, step])

  // When a date is selected, use cached busy data if available, otherwise fetch
  useEffect(() => {
    if (!selectedDate || !config) return
    const key = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    if (monthBusyMap[key]) {
      setBusySlots(monthBusyMap[key])
      return
    }
    async function fetchAvailability() {
      setLoadingSlots(true)
      setBusySlots([])
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/availability`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: selectedDate!.toISOString(), event_type_id: selectedType?.id }),
          }
        )
        const data = await res.json()
        if (data.busy) setBusySlots(data.busy)
      } catch {
        console.error('Error fetching availability')
      }
      setLoadingSlots(false)
    }
    fetchAvailability()
  }, [selectedDate, config, selectedType?.id, monthBusyMap])

  const isFormValid = () => {
    if (!formData.name || !formData.email) return false
    if (selectedType) {
      for (const f of selectedType.extra_fields) {
        if (f.required && !extraData[f.key]?.trim()) return false
      }
    }
    return true
  }

  const handleBook = async () => {
    if (!selectedType || !selectedDate || !selectedSlot || !config) return
    setSubmitting(true)
    setError('')

    const dt = new Date(selectedDate)
    dt.setHours(selectedSlot.hour, selectedSlot.minute, 0, 0)

    try {
      if (isReschedule) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reschedule`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: rescheduleToken,
              new_datetime: dt.toISOString(),
            }),
          }
        )
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Error al reagendar')
          setSubmitting(false)
          return
        }
      } else {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/book`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type_id: selectedType.id,
              datetime: dt.toISOString(),
              name: formData.name,
              email: formData.email,
              notes: formData.notes,
              extras: extraData,
            }),
          }
        )
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Error al agendar')
          setSubmitting(false)
          return
        }
        if (data.meet_link) setMeetLink(data.meet_link)
      }
      setStep('success')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    }
    setSubmitting(false)
  }

  const resetBooking = () => {
    setSelectedDate(null)
    setSelectedSlot(null)
    setFormData({ name: '', email: '', notes: '' })
    setExtraData({})
    setError('')
    setBusySlots([])
    setMeetLink(null)
    if (filterType && selectedType) {
      setStep('date')
    } else {
      setSelectedType(null)
      setStep('type')
    }
  }

  const goBack = () => {
    setError('')
    if (step === 'form') { setStep('date'); setSelectedSlot(null) }
    else if (step === 'date' && !filterType && !isReschedule) { setStep('type'); setSelectedType(null); setSelectedDate(null); setBusySlots([]) }
  }

  const stepIndex = step === 'type' ? 0 : step === 'date' ? 1 : step === 'form' ? 2 : 3
  const stepLabels = isReschedule
    ? ['Fecha', 'Confirmar']
    : filterType
      ? ['Fecha', 'Datos', 'Listo']
      : ['Tipo', 'Fecha', 'Datos', 'Listo']

  if (rescheduleError) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-bg">
        <div className="text-center animate-scale-in">
          <div className="w-20 h-20 rounded-[20px] flex items-center justify-center text-4xl mx-auto mb-5" style={{ background: '#FFF5F5' }}>
            <span style={{ filter: 'drop-shadow(0 2px 4px rgba(194,80,80,0.2))' }}>&#9888;&#65039;</span>
          </div>
          <div className="text-xl font-display mb-2">Enlace no válido</div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{rescheduleError}</div>
        </div>
      </div>
    )
  }

  if (loading || !config) {
    return (
      <div className="min-h-screen mesh-bg">
        {/* Skeleton Nav */}
        <div className="sticky top-0 z-50 floating-nav mx-4 mt-4 rounded-2xl px-6 py-3.5">
          <div className="flex items-center gap-4">
            <div className="skeleton h-[18px] w-[140px] rounded-md" />
            <div className="h-5 w-px" style={{ background: 'var(--border)' }} />
            <div className="skeleton h-3 w-[60px] rounded-md" />
          </div>
        </div>
        {/* Skeleton Content */}
        <div className="max-w-[1100px] mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] rounded-[20px] sm:rounded-[24px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <SkeletonSidebar />
            <SkeletonCalendar />
          </div>
        </div>
      </div>
    )
  }

  const displayTypes = (isReschedule && selectedType)
    ? eventTypes.filter(t => t.id === selectedType.id)
    : filterType
      ? eventTypes.filter(t => t.id === filterType)
      : eventTypes

  return (
    <div className="min-h-screen mesh-bg">
      {/* ─── Floating Navigation Bar ─── */}
      <div className="sticky top-0 z-50 floating-nav mx-2 sm:mx-4 mt-2 sm:mt-4 rounded-2xl px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <CVLogoFull height={16} />
          <div className="h-5 w-px hidden sm:block" style={{ background: 'var(--border)' }} />
          <div className="text-xs font-semibold uppercase tracking-widest hidden sm:block" style={{ color: 'var(--text-tertiary)' }}>Agenda</div>
        </div>
        {/* Progress Steps */}
        {step !== 'type' && (
          <div className="progress-steps hidden sm:flex">
            {stepLabels.map((label, i) => {
              const isActive = i === (filterType || isReschedule ? stepIndex - 1 : stepIndex)
              const isDone = i < (filterType || isReschedule ? stepIndex - 1 : stepIndex)
              return (
                <div key={label} className="flex items-center">
                  {i > 0 && <div className={`progress-step-line ${isDone ? 'done' : ''}`} />}
                  <div className={`progress-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                    <div className="progress-step-dot">
                      {isDone ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : i + 1}
                    </div>
                    <span className="hidden md:inline">{label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Main Content ─── */}
      <div className="max-w-[1100px] mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] rounded-[20px] sm:rounded-[24px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}>

          {/* ─── Sidebar ─── */}
          <div className="p-5 sm:p-8 border-b md:border-b-0 md:border-r flex flex-col gap-4 sm:gap-6" style={{ borderColor: 'var(--border)' }}>
            <CVMark size={44} />
            <div>
              <div className="font-display text-[22px]" style={{ letterSpacing: '-0.3px' }}>{config.name}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{config.title}</div>
              <div className="text-xs mt-0.5 font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>{config.org}</div>
            </div>

            <div className="h-px hidden md:block" style={{ background: 'var(--border)' }} />

            {isReschedule && (
              <div className="px-4 py-3 rounded-[14px] text-sm font-semibold glass-card" style={{ color: 'var(--accent)', borderColor: 'rgba(45,140,194,0.2)' }}>
                <span style={{ filter: 'drop-shadow(0 1px 2px rgba(45,140,194,0.2))' }}>&#128260;</span> Reagendando reunión
              </div>
            )}

            {/* When type is pre-selected (direct link or reschedule), show compact summary */}
            {(filterType || isReschedule) && selectedType ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                  {isReschedule ? 'Reunión' : 'Reunión seleccionada'}
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-2xl w-10 h-10 flex items-center justify-center rounded-[12px] shrink-0 bg-[var(--surface-alt)]">
                    {selectedType.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[15px]">{selectedType.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{selectedType.duration} min</div>
                    {selectedType.description && (
                      <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{selectedType.description}</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                  Tipo de reunión
                </div>
                <div className="flex md:flex-col gap-2.5 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 stagger-children">
                  {displayTypes.map((et) => (
                    <div
                      key={et.id}
                      className={`event-card flex items-center gap-3.5 p-4 rounded-[16px] border-2 min-w-[200px] md:min-w-0 shrink-0 md:shrink cursor-pointer ${selectedType?.id === et.id ? 'border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
                      style={selectedType?.id === et.id ? { background: 'var(--accent-light)', boxShadow: '0 4px 16px rgba(45,140,194,0.08)' } : {}}
                      onClick={() => {
                        setSelectedType(et)
                        setStep('date')
                        setSelectedSlot(null)
                        setExtraData({})
                        setBusySlots([])
                        setSelectedDate(null)
                        setMonthBusyMap({})
                        setFullyBookedDates(new Set())
                      }}
                    >
                      <div className={`text-2xl w-12 h-12 flex items-center justify-center rounded-[14px] ${selectedType?.id === et.id ? 'bg-[rgba(45,140,194,0.12)]' : 'bg-[var(--surface-alt)]'}`}
                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))' }}>
                        {et.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-[15px]">{et.name}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{et.duration} min</div>
                        {et.description && (
                          <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-tertiary)' }}>{et.description}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ─── Main Area ─── */}
          <div className="p-5 sm:p-8 flex flex-col min-h-[400px] md:min-h-[520px]">

            {/* Step: Select Type */}
            {step === 'type' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-20 animate-fade-in">
                <div className="empty-state-icon">
                  <span style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.08))' }}>&#128197;</span>
                </div>
                <div className="text-lg font-display">Selecciona un tipo de reunión</div>
                <div className="text-sm mt-1.5 max-w-[260px]" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Elige una opción del panel <span className="hidden md:inline">izquierdo</span><span className="md:hidden">superior</span> para comenzar
                </div>
                <div className="flex items-center gap-2 mt-4 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Rápido y sin crear cuenta
                </div>
              </div>
            )}

            {/* Step: Select Date & Time */}
            {step === 'date' && selectedType && (
              <div className="animate-slide-left">
                {!filterType && !isReschedule && (
                  <button onClick={goBack} className="text-sm mb-4 cursor-pointer border-none bg-transparent flex items-center gap-1.5 group" style={{ color: 'var(--text-secondary)' }}>
                    <span className="inline-block transition-transform duration-200 group-hover:-translate-x-1">&larr;</span> Cambiar tipo
                  </button>
                )}

                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="text-xl font-display" style={{ letterSpacing: '-0.2px' }}>
                      {MONTHS_ES[calMonth.getMonth()]} {calMonth.getFullYear()}
                    </div>
                    {loadingMonth && (
                      <div className="flex items-center gap-1.5 text-xs font-medium animate-fade-in" style={{ color: 'var(--text-tertiary)' }}>
                        <div className="w-3 h-3 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin" />
                        <span className="hidden sm:inline">Verificando...</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                      className="w-9 h-9 rounded-[10px] border flex items-center justify-center cursor-pointer bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)] transition-all duration-200"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>&lsaquo;</button>
                    <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                      className="w-9 h-9 rounded-[10px] border flex items-center justify-center cursor-pointer bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-alt)] transition-all duration-200"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>&rsaquo;</button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-6">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                    <div key={d} className="text-center text-xs font-semibold uppercase tracking-wider py-2" style={{ color: 'var(--text-tertiary)' }}>{d}</div>
                  ))}
                  {getCalendarDays(calMonth).map((cd, i) => {
                    const date = new Date(calMonth.getFullYear(), cd.month, cd.day)
                    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
                    const avail = !cd.otherMonth && isDateAvailable(config, date) && !fullyBookedDates.has(dateKey)
                    const isToday = !cd.otherMonth && isSameDay(date, new Date())
                    const isSel = selectedDate && !cd.otherMonth && isSameDay(date, selectedDate)
                    const isFullyBooked = !cd.otherMonth && isDateAvailable(config, date) && fullyBookedDates.has(dateKey)
                    return (
                      <div key={i}
                        className={`mini-cal-day ${cd.otherMonth ? 'other-month' : ''} ${!avail && !cd.otherMonth ? 'disabled' : ''} ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''} ${isFullyBooked ? 'fully-booked' : ''}`}
                        onClick={() => { if (avail && !cd.otherMonth) { setSelectedDate(date); setSelectedSlot(null) } }}
                        title={isFullyBooked ? 'Sin horarios disponibles' : undefined}>
                        {cd.day}
                      </div>
                    )
                  })}
                </div>

                {selectedDate && (() => {
                  const slots = generateTimeSlots(config, selectedDate, selectedType.duration)
                  return (
                    <div className="flex-1 animate-slide-up">
                      <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                        {DAYS_ES[selectedDate.getDay()]} {selectedDate.getDate()} de {MONTHS_ES[selectedDate.getMonth()]}
                      </div>

                      {loadingSlots ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
                          {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="skeleton h-[46px] w-full rounded-[14px]" style={{ animationDelay: `${i * 50}ms` }} />
                          ))}
                        </div>
                      ) : slots.length === 0 ? (
                        <div className="text-center py-8 text-sm animate-fade-in" style={{ color: 'var(--text-tertiary)' }}>No hay horarios disponibles este día</div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 max-h-[240px] sm:max-h-[280px] overflow-y-auto slots-scroll pr-1 stagger-children">
                          {slots.map((slot, i) => {
                            const busy = isSlotBusy(busySlots, selectedDate, slot, selectedType.duration)
                            const isSel = selectedSlot?.label === slot.label
                            if (busy) return null
                            return (
                              <button key={i}
                                className={`slot-btn ${isSel ? 'selected' : ''}`}
                                onClick={() => { setSelectedSlot(slot); setStep('form') }}>
                                {slot.label}
                              </button>
                            )
                          })}
                          {slots.every((slot) => isSlotBusy(busySlots, selectedDate, slot, selectedType.duration)) && (
                            <div className="col-span-2 sm:col-span-3 text-center py-8 text-sm animate-fade-in" style={{ color: 'var(--text-tertiary)' }}>
                              No hay horarios disponibles este día
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Step: Form */}
            {step === 'form' && selectedSlot && selectedType && selectedDate && (
              <div className="animate-slide-left">
                <button onClick={goBack} className="text-sm mb-4 cursor-pointer border-none bg-transparent flex items-center gap-1.5 group" style={{ color: 'var(--text-secondary)' }}>
                  <span className="inline-block transition-transform duration-200 group-hover:-translate-x-1">&larr;</span> Cambiar horario
                </button>
                <div className="text-xl font-display" style={{ letterSpacing: '-0.2px' }}>{isReschedule ? 'Confirmar reagendamiento' : 'Confirmar reunión'}</div>

                {/* Selection summary pill */}
                <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[14px] mt-3 mb-6 text-sm font-semibold glass-card">
                  <span>{selectedType.emoji}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{selectedType.name}</span>
                  <span style={{ color: 'var(--border-strong)' }}>&middot;</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{selectedType.duration} min</span>
                  <span style={{ color: 'var(--border-strong)' }}>&middot;</span>
                  <span style={{ color: 'var(--accent)' }}>{DAYS_ES[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1} &middot; {selectedSlot.label}</span>
                </div>

                {isReschedule ? (
                  <div className="rounded-[18px] p-6 text-sm mb-6" style={{ background: 'var(--surface-alt)' }}>
                    {rescheduleData?.datetime && (
                      <div className="flex justify-between py-2">
                        <span style={{ color: 'var(--text-tertiary)' }}>Fecha original</span>
                        <span className="font-semibold" style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>
                          {new Date(rescheduleData.datetime).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} {new Date(rescheduleData.datetime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between py-2 mt-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Nueva fecha</span>
                      <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                        {DAYS_ES[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1} · {selectedSlot.label}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-wider mb-3 mt-2" style={{ color: 'var(--text-tertiary)' }}>Tu información</div>
                    <div className="mb-4">
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Nombre <span style={{ color: 'var(--accent)' }}>*</span>
                      </label>
                      <input className="form-input" placeholder="Tu nombre completo" value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div className="mb-4">
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Email <span style={{ color: 'var(--accent)' }}>*</span>
                      </label>
                      <input className="form-input" type="email" placeholder="tu@email.com" value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    </div>

                    {selectedType.extra_fields.length > 0 && (
                      <>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-3 mt-6" style={{ color: 'var(--text-tertiary)' }}>Sobre la reunión</div>
                        {selectedType.extra_fields.map(f => (
                          <div className="mb-4" key={f.key}>
                            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                              {f.label} {f.required && <span style={{ color: 'var(--accent)' }}>*</span>}
                            </label>
                            {f.type === 'textarea' ? (
                              <textarea className="form-input" placeholder={f.placeholder} value={extraData[f.key] || ''}
                                onChange={e => setExtraData({ ...extraData, [f.key]: e.target.value })} />
                            ) : (
                              <input className="form-input" placeholder={f.placeholder} value={extraData[f.key] || ''}
                                onChange={e => setExtraData({ ...extraData, [f.key]: e.target.value })} />
                            )}
                          </div>
                        ))}
                      </>
                    )}

                    <div className="mb-4">
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Notas adicionales</label>
                      <textarea className="form-input" placeholder="¿Algo más que deba saber?" value={formData.notes}
                        onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                    </div>
                  </>
                )}

                {error && (
                  <div className="text-sm font-medium px-4 py-3 rounded-[12px] mb-4 animate-scale-in" style={{ background: '#FFF5F5', color: '#C25050', border: '1px solid #E8B4B4' }}>
                    {error}
                  </div>
                )}

                <div className="flex gap-2.5 mt-6">
                  <button className="btn-primary" onClick={handleBook} disabled={(!isReschedule && !isFormValid()) || submitting}>
                    {submitting ? (isReschedule ? 'Reagendando...' : 'Agendando...') : (isReschedule ? 'Confirmar reagendamiento' : 'Confirmar reserva')}
                  </button>
                  <button className="btn-secondary" onClick={goBack}>Volver</button>
                </div>
              </div>
            )}

            {/* Step: Success */}
            {step === 'success' && selectedType && selectedDate && selectedSlot && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 relative overflow-hidden">
                {/* Confetti dots */}
                {[
                  { color: 'var(--accent)', left: '20%', delay: '0s' },
                  { color: 'var(--success)', left: '35%', delay: '0.1s' },
                  { color: '#F59E0B', left: '50%', delay: '0.2s' },
                  { color: 'var(--accent)', left: '65%', delay: '0.15s' },
                  { color: '#EC4899', left: '80%', delay: '0.25s' },
                  { color: 'var(--success)', left: '25%', delay: '0.3s' },
                  { color: '#8B5CF6', left: '70%', delay: '0.05s' },
                ].map((dot, i) => (
                  <div key={i} className="confetti-dot" style={{ background: dot.color, left: dot.left, top: '45%', animationDelay: dot.delay }} />
                ))}

                {/* Animated success icon */}
                <div className="animate-success-pulse animate-ripple w-[80px] h-[80px] rounded-[22px] flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>

                <div className="text-2xl font-display mb-2 animate-slide-up" style={{ letterSpacing: '-0.2px', animationDelay: '0.2s', animationFillMode: 'backwards' }}>
                  {isReschedule ? '¡Reunión reagendada!' : '¡Reunión agendada!'}
                </div>
                <div className="text-sm max-w-[360px] mx-auto animate-slide-up" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, animationDelay: '0.3s', animationFillMode: 'backwards' }}>
                  {isReschedule ? 'Tu reunión ha sido movida exitosamente.' : `Tu reunión con ${config.name} ha sido confirmada.`}
                </div>

                {/* Summary card */}
                <div className="max-w-[340px] w-full mx-auto mt-6 rounded-[18px] p-6 text-left text-sm animate-slide-up" style={{ background: 'var(--surface-alt)', animationDelay: '0.4s', animationFillMode: 'backwards' }}>
                  <div className="flex justify-between py-2"><span style={{ color: 'var(--text-tertiary)' }}>Tipo</span><span className="font-semibold">{selectedType.emoji} {selectedType.name}</span></div>
                  <div className="flex justify-between py-2"><span style={{ color: 'var(--text-tertiary)' }}>Fecha</span><span className="font-semibold">{DAYS_ES[selectedDate.getDay()]} {selectedDate.getDate()} de {MONTHS_ES[selectedDate.getMonth()]}</span></div>
                  <div className="flex justify-between py-2"><span style={{ color: 'var(--text-tertiary)' }}>Hora</span><span className="font-semibold">{selectedSlot.label} ({config.timezone})</span></div>
                  <div className="flex justify-between py-2"><span style={{ color: 'var(--text-tertiary)' }}>Duración</span><span className="font-semibold">{selectedType.duration} min</span></div>
                </div>

                {/* Google Meet button */}
                {meetLink && (
                  <div className="animate-slide-up" style={{ animationDelay: '0.5s', animationFillMode: 'backwards' }}>
                    <a href={meetLink} target="_blank" rel="noopener noreferrer"
                      className="btn-meet inline-flex items-center gap-2.5 px-6 py-3.5 rounded-[14px] mt-6 text-sm font-semibold no-underline"
                      style={{ background: '#1a73e8', color: '#fff' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                      Unirse a Google Meet
                    </a>
                  </div>
                )}

                {/* Calendar invite notice */}
                <div className="animate-slide-up" style={{ animationDelay: '0.6s', animationFillMode: 'backwards' }}>
                  <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[12px] mt-4 text-sm font-semibold" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Recibirás una invitación de Google Calendar{formData.email ? ` en ${formData.email}` : ''}
                  </div>
                </div>

                <div className="mt-8 animate-slide-up" style={{ animationDelay: '0.7s', animationFillMode: 'backwards' }}>
                  <button className="btn-secondary" onClick={resetBooking}>Agendar otra reunión</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
