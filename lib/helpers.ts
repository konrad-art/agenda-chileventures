import { Config, EventType, TimeSlot, Booking } from './types'

export const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
export const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

export function generateTimeSlots(config: Config, date: Date, duration: number): TimeSlot[] {
  const slots: TimeSlot[] = []
  const dayOfWeek = date.getDay()
  if (!config.working_days.includes(dayOfWeek)) return slots

  // Use per-day schedule if available, otherwise fall back to global start/end
  const daySchedule = config.day_schedules?.[String(dayOfWeek)]
  let startMin: number, endMin: number
  if (daySchedule) {
    const [sh, sm] = daySchedule.start.split(':').map(Number)
    const [eh, em] = daySchedule.end.split(':').map(Number)
    startMin = sh * 60 + sm
    endMin = eh * 60 + em
  } else {
    startMin = config.start_hour * 60
    endMin = config.end_hour * 60
  }

  for (let min = startMin; min < endMin; min += 30) {
    if (min + duration > endMin) continue
    const h = Math.floor(min / 60)
    const m = min % 60
    slots.push({
      hour: h,
      minute: m,
      label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    })
  }
  return slots
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isSlotBooked(bookings: Booking[], date: Date, slot: TimeSlot, duration: number) {
  const slotStart = new Date(date)
  slotStart.setHours(slot.hour, slot.minute, 0, 0)
  const slotEnd = new Date(slotStart.getTime() + duration * 60000)
  return bookings.some((b) => {
    if (b.status !== 'confirmed') return false
    const bStart = new Date(b.datetime)
    const bEnd = new Date(bStart.getTime() + b.duration * 60000)
    return slotStart < bEnd && slotEnd > bStart
  })
}

export function isDateAvailable(config: Config, date: Date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  if (d < today) return false
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() + config.max_days_ahead)
  if (d > maxDate) return false
  return config.working_days.includes(d.getDay())
}

export function getCalendarDays(calMonth: Date) {
  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const days: { day: number; month: number; otherMonth: boolean }[] = []
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  for (let i = startOffset - 1; i >= 0; i--) days.push({ day: daysInPrev - i, month: month - 1, otherMonth: true })
  for (let d = 1; d <= daysInMonth; d++) days.push({ day: d, month, otherMonth: false })
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) days.push({ day: d, month: month + 1, otherMonth: true })
  return days
}
