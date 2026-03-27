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

  const [busySlots, setBusySlots] = useState<BusySlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [rescheduleData, setRescheduleData] = useState<any>(null)
  const [rescheduleError, setRescheduleError] = useState('')

  const isReschedule = !!rescheduleToken

  // Load data from Supabase
  useEffect(() => {
    async function load() {
      const [configRes, typesRes] = await Promise.all([
        supabase.from('config').select('id, name, title, org, timezone, working_days, start_hour, end_hour, buffer_minutes, max_days_ahead').single(),
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
        const match = eventTypes.find((t: EventType) => t.id === data.booking.event_type_id)
        if (match) {
          setSelectedType(match)
          setFormData({ name: data.booking.name, email: data.booking.email, notes: data.booking.notes || '' })
          setExtraData(data.booking.extras || {})
          setStep('date')
        }
      } catch {
        setRescheduleError('Error al cargar los datos de la reunión')
      }
    }
    loadReschedule()
  }, [rescheduleToken, eventTypes])

  // Fetch busy slots when date changes
  useEffect(() => {
    if (!selectedDate || !config) return
    async function fetchAvailability() {
      setLoadingSlots(true)
      setBusySlots([])
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/availability`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: selectedDate!.toISOString() }),
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
  }, [selectedDate, config])

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
        // Reschedule: POST to reschedule endpoint
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
        // New booking: POST to book endpoint
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

  if (rescheduleError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <div className="text-xl font-semibold mb-2">Enlace no válido</div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{rescheduleError}</div>
        </div>
      </div>
    )
  }

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
        Cargando...
      </div>
    )
  }

  const displayTypes = (isReschedule && selectedType)
    ? eventTypes.filter(t => t.id === selectedType.id)
    : filterType
      ? eventTypes.filter(t => t.id === filterType)
      : eventTypes

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Top Bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-4">
          <CVLogoFull height={18} dark={true} />
          <div className="h-5 w-px" style={{ background: 'var(--border-strong)' }} />
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Agenda</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1100px] mx-auto p-8">
        <div className="grid md:grid-cols-[300px_1fr] rounded-[20px] border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>

          {/* Sidebar */}
          <div className="p-8 border-r flex flex-col gap-6" style={{ borderColor: 'var(--border)' }}>
            <CVMark size={52} />
            <div>
              <div className="font-bold text-[17px]" style={{ letterSpacing: '-0.2px' }}>{config.name}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{config.title}</div>
              <div className="text-xs mt-0.5 font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>{config.org}</div>
            </div>

            <div className="h-px" style={{ background: 'var(--border)' }} />

            {isReschedule && (
              <div className="px-4 py-3 rounded-[10px] text-sm font-semibold" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                🔄 Reagendando reunión
              </div>
            )}

            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              {isReschedule ? 'Reunión' : filterType ? 'Reunión seleccionada' : 'Tipo de reunión'}
            </div>

            <div className="flex flex-col gap-2.5">
              {displayTypes.map((et) => (
                <div
                  key={et.id}
                  className={`flex items-center gap-3.5 p-4 rounded-[14px] border-2 transition-all ${isReschedule ? '' : 'cursor-pointer'} ${selectedType?.id === et.id ? 'border-[var(--accent)] bg-[var(--accent-light)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
                  onClick={() => {
                    if (isReschedule) return // Lock type in reschedule mode
                    setSelectedType(et)
                    setStep('date')
                    setSelectedSlot(null)
                    setExtraData({})
                    setBusySlots([])
                    setSelectedDate(null)
                  }}
                >
                  <div className={`text-2xl w-11 h-11 flex items-center justify-center rounded-[10px] ${selectedType?.id === et.id ? 'bg-[rgba(45,140,194,0.12)]' : 'bg-[var(--surface-alt)]'}`}>
                    {et.emoji}
                  </div>
                  <div>
                    <div className="font-semibold text-[15px]">{et.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{et.duration} min</div>
                    {et.description && (
                      <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{et.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main Area */}
          <div className="p-8 flex flex-col">

            {/* Step: Select Type */}
            {step === 'type' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
                <div className="text-5xl mb-4">📅</div>
                <div className="text-base font-semibold">Selecciona un tipo de reunión</div>
                <div className="mt-1.5" style={{ color: 'var(--text-secondary)' }}>Elige una opción del panel izquierdo</div>
              </div>
            )}

            {/* Step: Select Date & Time */}
            {step === 'date' && selectedType && (
              <>
                {!filterType && (
                  <button onClick={goBack} className="text-sm mb-4 cursor-pointer border-none bg-transparent" style={{ color: 'var(--text-secondary)' }}>
                    ← Cambiar tipo
                  </button>
                )}

                <div className="flex items-center justify-between mb-5">
                  <div className="text-xl font-semibold" style={{ letterSpacing: '-0.2px' }}>
                    {MONTHS_ES[calMonth.getMonth()]} {calMonth.getFullYear()}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                      className="w-9 h-9 rounded-[10px] border flex items-center justify-center cursor-pointer bg-[var(--surface)] hover:border-[var(--border-strong)]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>‹</button>
                    <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                      className="w-9 h-9 rounded-[10px] border flex items-center justify-center cursor-pointer bg-[var(--surface)] hover:border-[var(--border-strong)]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>›</button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-0.5 mb-6">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                    <div key={d} className="text-center text-xs font-semibold uppercase tracking-wider py-2" style={{ color: 'var(--text-tertiary)' }}>{d}</div>
                  ))}
                  {getCalendarDays(calMonth).map((cd, i) => {
                    const date = new Date(calMonth.getFullYear(), cd.month, cd.day)
                    const avail = !cd.otherMonth && isDateAvailable(config, date)
                    const isToday = !cd.otherMonth && isSameDay(date, new Date())
                    const isSel = selectedDate && !cd.otherMonth && isSameDay(date, selectedDate)
                    return (
                      <div key={i}
                        className={`mini-cal-day ${cd.otherMonth ? 'other-month' : ''} ${!avail && !cd.otherMonth ? 'disabled' : ''} ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}`}
                        onClick={() => { if (avail && !cd.otherMonth) { setSelectedDate(date); setSelectedSlot(null) } }}>
                        {cd.day}
                      </div>
                    )
                  })}
                </div>

                {selectedDate && (() => {
                  const slots = generateTimeSlots(config, selectedDate, selectedType.duration)
                  return (
                    <div className="flex-1">
                      <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                        {DAYS_ES[selectedDate.getDay()]} {selectedDate.getDate()} de {MONTHS_ES[selectedDate.getMonth()]}
                      </div>

                      {loadingSlots ? (
                        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                          Consultando disponibilidad...
                        </div>
                      ) : slots.length === 0 ? (
                        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>No hay horarios disponibles este día</div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 max-h-[280px] overflow-y-auto slots-scroll pr-1">
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
                            <div className="col-span-3 text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                              No hay horarios disponibles este día
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            )}

            {/* Step: Form (reschedule = summary only, new booking = full form) */}
            {step === 'form' && selectedSlot && selectedType && selectedDate && (
              <div className="animate-slide-up">
                <button onClick={goBack} className="text-sm mb-4 cursor-pointer border-none bg-transparent" style={{ color: 'var(--text-secondary)' }}>
                  ← Cambiar horario
                </button>
                <div className="text-xl font-semibold">{isReschedule ? 'Confirmar reagendamiento' : 'Confirmar reunión'}</div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] mt-3 mb-6 text-sm font-semibold" style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}>
                  {selectedType.emoji} {selectedType.name} · {selectedType.duration} min · {DAYS_ES[selectedDate.getDay()]} {selectedDate.getDate()}/{selectedDate.getMonth() + 1} · {selectedSlot.label}
                </div>

                {isReschedule ? (
                  <>
                    {/* Reschedule: read-only summary */}
                    <div className="rounded-[14px] p-5 text-sm mb-6" style={{ background: 'var(--surface-alt)' }}>
                      <div className="flex justify-between py-1.5"><span style={{ color: 'var(--text-tertiary)' }}>Nombre</span><span className="font-semibold">{formData.name}</span></div>
                      <div className="flex justify-between py-1.5"><span style={{ color: 'var(--text-tertiary)' }}>Email</span><span className="font-semibold">{formData.email}</span></div>
                      {extraData.startup && <div className="flex justify-between py-1.5"><span style={{ color: 'var(--text-tertiary)' }}>Startup</span><span className="font-semibold">{extraData.startup}</span></div>}
                      {rescheduleData?.datetime && (
                        <div className="flex justify-between py-1.5 mt-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--text-tertiary)' }}>Fecha original</span>
                          <span className="font-semibold" style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>
                            {new Date(rescheduleData.datetime).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} {new Date(rescheduleData.datetime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* New booking: full form */}
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
                  <div className="text-sm font-medium px-4 py-3 rounded-[10px] mb-4" style={{ background: '#FFF5F5', color: '#C25050', border: '1px solid #E8B4B4' }}>
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
              <div className="animate-slide-up text-center py-16">
                <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-3xl mx-auto mb-6 font-bold" style={{ background: 'var(--success-light)', color: 'var(--success)', fontSize: '28px' }}>✓</div>
                <div className="text-2xl font-semibold mb-2">{isReschedule ? '¡Reunión reagendada!' : '¡Reunión agendada!'}</div>
                <div className="text-sm max-w-[360px] mx-auto" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {isReschedule ? 'Tu reunión ha sido movida exitosamente.' : `Tu reunión con ${config.name} ha sido confirmada.`}
                </div>

                <div className="max-w-[320px] mx-auto mt-6 rounded-[14px] p-5 text-left text-sm" style={{ background: 'var(--surface-alt)' }}>
                  <div className="flex justify-between py-1.5"><span style={{ color: 'var(--text-tertiary)' }}>Tipo</span><span className="font-semibold">{selectedType.emoji} {selectedType.name}</span></div>
                  <div className="flex justify-between py-1.5"><span style={{ color: 'var(--text-tertiary)' }}>Fecha</span><span className="font-semibold">{DAYS_ES[selectedDate.getDay()]} {selectedDate.getDate()} de {MONTHS_ES[selectedDate.getMonth()]}</span></div>
                  <div className="flex justify-between py-1.5"><span style={{ color: 'var(--text-tertiary)' }}>Hora</span><span className="font-semibold">{selectedSlot.label} ({config.timezone})</span></div>
                  <div className="flex justify-between py-1.5"><span style={{ color: 'var(--text-tertiary)' }}>Duración</span><span className="font-semibold">{selectedType.duration} min</span></div>
                </div>

                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] mt-6 text-sm font-semibold" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                  📧 Confirmación enviada a {formData.email}
                </div>

                <div className="mt-8">
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
