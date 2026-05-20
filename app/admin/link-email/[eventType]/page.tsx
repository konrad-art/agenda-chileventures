'use client'

// Standalone "Link Email" page for a specific event type.
// ─────────────────────────────────────────────────────────────────────────────
// URL:  /admin/link-email/{eventTypeId}
//       e.g. /admin/link-email/catchup
//
// Purpose: lets the host (or an AI agent) jump straight to the slot-proposal
// creator without going through Settings → scroll → Link email. Useful as a
// Chrome bookmark or as a URL handed to an AI agent.
//
// Protection: covered by the existing middleware rule for /admin/:path*.
//
// UX: loads config + event type, then immediately renders ProposedSlotsModal
// (which uses fixed positioning and overlays everything). onClose → back to
// /admin/settings.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Config, EventType } from '@/lib/types'
import ProposedSlotsModal from '@/components/ProposedSlotsModal'

export default function AdminLinkEmailPage() {
  const params = useParams()
  const router = useRouter()
  const eventTypeId = params.eventType as string

  const [config, setConfig] = useState<Config | null>(null)
  const [eventType, setEventType] = useState<EventType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventTypeId) return
    async function load() {
      const [configRes, etRes] = await Promise.all([
        supabase
          .from('config')
          .select('id, name, title, org, timezone, working_days, start_hour, end_hour, buffer_minutes, max_days_ahead, min_advance_hours, day_schedules')
          .single(),
        supabase
          .from('event_types')
          .select('id, name, emoji, duration, description, extra_fields, is_active, sort_order, min_advance_hours')
          .eq('id', eventTypeId)
          .maybeSingle(),
      ])
      if (!configRes.data) {
        setError('No se pudo cargar la configuración')
      } else if (!etRes.data) {
        setError(`Tipo de cita "${eventTypeId}" no encontrado`)
      } else {
        setConfig(configRes.data)
        setEventType(etRes.data)
      }
      setLoading(false)
    }
    load()
  }, [eventTypeId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Cargando…</div>
      </div>
    )
  }

  if (error || !config || !eventType) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="text-base font-semibold">{error || 'Error al cargar'}</div>
        <button
          onClick={() => router.push('/admin/settings')}
          className="btn-primary text-sm"
        >
          Ir a Configuración
        </button>
      </div>
    )
  }

  return (
    // The modal uses fixed inset-0 so it overlays the admin nav + this empty bg.
    // onClose sends back to settings (natural next step after generating a link).
    <ProposedSlotsModal
      eventType={eventType}
      config={config}
      onClose={() => router.push('/admin/settings')}
    />
  )
}
