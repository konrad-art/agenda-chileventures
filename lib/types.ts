export interface Config {
  id: string
  name: string
  title: string
  org: string
  timezone: string
  working_days: number[]
  start_hour: number
  end_hour: number
  buffer_minutes: number
  max_days_ahead: number
  google_calendar_token?: any
  google_calendar_id?: string
  notification_email?: string
  day_schedules?: Record<string, { start: string; end: string }>
}

export interface EventType {
  id: string
  name: string
  duration: number
  color?: string
  emoji: string
  description: string
  extra_fields: ExtraField[]
  is_active?: boolean
  sort_order: number
}

export interface ExtraField {
  key: string
  label: string
  placeholder: string
  required: boolean
  type?: string
}

export interface Booking {
  id: string
  event_type_id: string
  datetime: string
  duration: number
  name: string
  email: string
  notes: string
  extras: Record<string, string>
  status: string
  google_event_id: string | null
  reschedule_token?: string
  created_at: string
  event_types?: EventType
}

export interface TimeSlot {
  hour: number
  minute: number
  label: string
}
