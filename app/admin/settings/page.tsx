'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Config, EventType } from '@/lib/types'
import { DAYS_ES } from '@/lib/helpers'

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [gcalConnected, setGcalConnected] = useState(false)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://agenda-chileventures.vercel.app'

  useEffect(() => {
    async function load() {
      const [configRes, typesRes] = await Promise.all([
        supabase.from('config').select('*').single(),
        supabase.from('event_types').select('*').order('sort_order'),
      ])
      if (configRes.data) {
        setConfig(configRes.data)
        setGcalConnected(!!configRes.data.google_calendar_token)
      }
      if (typesRes.data) setEventTypes(typesRes.data)
      setLoading(false)
    }
    load()
  }, [])

  const saveConfig = async (updates: Partial<Config>) => {
    if (!config) return
    setSaving(true)
    const updated = { ...config, ...updates }
    setConfig(updated)
    await supabase.from('config').update(updates).eq('id', config.id)
    setSaving(false)
  }

  const copyLink = (path: string, id: string) => {
    navigator.clipboard?.writeText(`${siteUrl}${path}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading || !config) {
    return <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Cargando...</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Profile */}
      <div className="rounded-[16px] border p-7" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="font-display text-lg font-semibold mb-5 flex items-center gap-2">👤 Perfil</h2>
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nombre</label>
          <input className="form-input" value={config.name} onChange={e => saveConfig({ name: e.target.value })} />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Cargo</label>
          <input className="form-input" value={config.title} onChange={e => saveConfig({ title: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Organización</label>
          <input className="form-input" value={config.org} onChange={e => saveConfig({ org: e.target.value })} />
        </div>
      </div>

      {/* Schedule */}
      <div className="rounded-[16px] border p-7" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="font-display text-lg font-semibold mb-5 flex items-center gap-2">⏰ Horario</h2>
        {[
          { label: 'Desde', key: 'start_hour' as const, suffix: 'hrs' },
          { label: 'Hasta', key: 'end_hour' as const, suffix: 'hrs' },
          { label: 'Buffer', key: 'buffer_minutes' as const, suffix: 'min entre reuniones' },
          { label: 'Ventana', key: 'max_days_ahead' as const, suffix: 'días hacia adelante' },
        ].map(item => (
          <div key={item.key} className="flex items-center gap-3 mb-3">
            <span className="text-sm min-w-[60px]" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
            <input type="number" className="w-[100px] text-center px-3 py-2.5 rounded-[10px] border-2 font-semibold text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text)', fontFamily: 'DM Sans' }}
              value={config[item.key]}
              onChange={e => saveConfig({ [item.key]: parseInt(e.target.value) || 0 })} />
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{item.suffix}</span>
          </div>
        ))}
      </div>

      {/* Working Days */}
      <div className="rounded-[16px] border p-7 md:col-span-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="font-display text-lg font-semibold mb-5 flex items-center gap-2">📆 Días laborales</h2>
        <div className="flex gap-2 flex-wrap">
          {DAYS_ES.map((d, i) => (
            <div key={i}
              className={`px-4 py-2 rounded-[10px] border-2 text-sm font-semibold cursor-pointer transition-all ${config.working_days.includes(i) ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)]'}`}
              onClick={() => {
                const wd = config.working_days.includes(i)
                  ? config.working_days.filter(x => x !== i)
                  : [...config.working_days, i].sort()
                saveConfig({ working_days: wd })
              }}>
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* Google Calendar */}
      <div className="rounded-[16px] border p-7 md:col-span-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">📅 Google Calendar</h2>
        {gcalConnected ? (
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
              ✓ Conectado
            </div>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Tu calendario se usa para verificar disponibilidad y crear eventos</span>
          </div>
        ) : (
          <div>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Conecta tu Google Calendar para verificar disponibilidad real y crear eventos automáticamente.</p>
            <a href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/google-auth?action=connect`}
              className="btn-primary inline-block no-underline">
              Conectar Google Calendar
            </a>
          </div>
        )}
      </div>

      {/* Share Links */}
      <div className="rounded-[16px] border p-7 md:col-span-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">🔗 Links para compartir</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>Cada tipo de reunión tiene su propio link directo.</p>

        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Página general</div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-[12px]" style={{ background: 'var(--surface-alt)' }}>
            <div className="flex-1 text-sm font-mono truncate">{siteUrl}</div>
            <button onClick={() => copyLink('', 'general')}
              className="px-4 py-2 rounded-[8px] text-xs font-semibold text-white border-none cursor-pointer" style={{ background: 'var(--accent)', fontFamily: 'DM Sans' }}>
              {copiedId === 'general' ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Links por tipo</div>
        <div className="flex flex-col gap-2">
          {eventTypes.map(et => (
            <div key={et.id} className="flex items-center gap-3 px-4 py-3 rounded-[12px]" style={{ background: 'var(--surface-alt)' }}>
              <span className="text-lg">{et.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{et.name} <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>· {et.duration} min</span></div>
                <div className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{siteUrl}/{et.id}</div>
              </div>
              <button onClick={() => copyLink(`/${et.id}`, et.id)}
                className="px-4 py-2 rounded-[8px] text-xs font-semibold text-white border-none cursor-pointer whitespace-nowrap" style={{ background: 'var(--accent)', fontFamily: 'DM Sans' }}>
                {copiedId === et.id ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
