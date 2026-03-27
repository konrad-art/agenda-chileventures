'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Config, EventType, ExtraField } from '@/lib/types'
import { DAYS_ES } from '@/lib/helpers'

type EditingEventType = Omit<EventType, 'sort_order'> & { sort_order?: number }

const EMOJI_OPTIONS = ['👋', '🔍', '🏢', '🔄', '⚡', '📅', '💡', '🎯', '🚀', '💬', '🤝', '📊', '📞', '☕', '🧑‍💻', '📝']

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'new-type'
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [gcalConnected, setGcalConnected] = useState(false)

  // Event type editing
  const [editingType, setEditingType] = useState<EditingEventType | null>(null)
  const [isNewType, setIsNewType] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [typeSaving, setTypeSaving] = useState(false)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://agenda-chileventures.vercel.app'

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
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

  // --- Event Type CRUD ---

  const startEditing = (et: EventType) => {
    setEditingType({ ...et, extra_fields: [...et.extra_fields.map(f => ({ ...f }))] })
    setIsNewType(false)
  }

  const startCreating = () => {
    const maxOrder = eventTypes.length > 0 ? Math.max(...eventTypes.map(t => t.sort_order)) : 0
    setEditingType({
      id: '',
      name: '',
      duration: 30,
      color: '#C25B3F',
      emoji: '📅',
      description: '',
      extra_fields: [],
      is_active: true,
      sort_order: maxOrder + 1,
    })
    setIsNewType(true)
  }

  const cancelEditing = () => {
    setEditingType(null)
    setIsNewType(false)
  }

  const updateEditingField = (key: keyof EditingEventType, value: any) => {
    if (!editingType) return
    const updated = { ...editingType, [key]: value }
    // Auto-generate slug from name for new types
    if (key === 'name' && isNewType) {
      updated.id = generateSlug(value)
    }
    setEditingType(updated)
  }

  const addExtraField = () => {
    if (!editingType) return
    setEditingType({
      ...editingType,
      extra_fields: [...editingType.extra_fields, { key: '', label: '', placeholder: '', required: false, type: 'text' }]
    })
  }

  const updateExtraField = (index: number, field: Partial<ExtraField>) => {
    if (!editingType) return
    const fields = [...editingType.extra_fields]
    fields[index] = { ...fields[index], ...field }
    // Auto-generate key from label
    if (field.label !== undefined) {
      fields[index].key = field.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    }
    setEditingType({ ...editingType, extra_fields: fields })
  }

  const removeExtraField = (index: number) => {
    if (!editingType) return
    setEditingType({
      ...editingType,
      extra_fields: editingType.extra_fields.filter((_, i) => i !== index)
    })
  }

  const saveEventType = async () => {
    if (!editingType || !editingType.name.trim()) return
    setTypeSaving(true)

    const data = {
      id: editingType.id || generateSlug(editingType.name),
      name: editingType.name.trim(),
      duration: editingType.duration,
      color: editingType.color || '#C25B3F',
      emoji: editingType.emoji,
      description: editingType.description?.trim() || '',
      extra_fields: editingType.extra_fields.filter(f => f.label.trim()),
      is_active: editingType.is_active ?? true,
      sort_order: editingType.sort_order ?? eventTypes.length,
    }

    if (isNewType) {
      await supabase.from('event_types').insert(data)
    } else {
      const { id, ...updateData } = data
      await supabase.from('event_types').update(updateData).eq('id', editingType.id)
    }

    await loadData()
    setEditingType(null)
    setIsNewType(false)
    setTypeSaving(false)
  }

  const deleteEventType = async (id: string) => {
    await supabase.from('event_types').delete().eq('id', id)
    setDeleteConfirm(null)
    await loadData()
  }

  const toggleActive = async (et: EventType) => {
    await supabase.from('event_types').update({ is_active: !et.is_active }).eq('id', et.id)
    await loadData()
  }

  if (loading || !config) {
    return <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Cargando...</div>
  }

  // --- Event Type Editor Modal ---
  if (editingType) {
    return (
      <div>
        <button onClick={cancelEditing} className="flex items-center gap-2 text-sm font-semibold mb-6 cursor-pointer bg-transparent border-none" style={{ color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
          ← Volver a configuración
        </button>

        <div className="rounded-[16px] border p-7" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <h2 className="text-xl font-semibold mb-6">
            {isNewType ? 'Crear tipo de reunión' : `Editar: ${editingType.name}`}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nombre *</label>
              <input className="form-input" value={editingType.name} onChange={e => updateEditingField('name', e.target.value)} placeholder="Ej: Intro Call" />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Duración (minutos) *</label>
              <input className="form-input" type="number" min={5} max={480} value={editingType.duration} onChange={e => updateEditingField('duration', parseInt(e.target.value) || 30)} />
            </div>

            {/* Slug / ID */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Link (slug) {!isNewType && <span className="normal-case font-normal">— no editable</span>}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{siteUrl}/</span>
                <input className="form-input flex-1" value={editingType.id} disabled={!isNewType}
                  onChange={e => isNewType && updateEditingField('id', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  style={!isNewType ? { opacity: 0.6 } : {}} />
              </div>
            </div>

            {/* Emoji */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Emoji</label>
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_OPTIONS.map(e => (
                  <button key={e} onClick={() => updateEditingField('emoji', e)}
                    className={`w-10 h-10 rounded-[8px] text-lg border-2 cursor-pointer flex items-center justify-center transition-all ${editingType.emoji === e ? 'border-[var(--accent)] bg-[var(--accent-light)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Descripción</label>
            <input className="form-input" value={editingType.description || ''} onChange={e => updateEditingField('description', e.target.value)}
              placeholder="Ej: Primera conversación para conocer tu startup" />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3 mb-8 px-4 py-3 rounded-[12px]" style={{ background: 'var(--surface-alt)' }}>
            <button onClick={() => updateEditingField('is_active', !editingType.is_active)}
              className="relative w-11 h-6 rounded-full border-none cursor-pointer transition-all"
              style={{ background: editingType.is_active ? 'var(--accent)' : 'var(--border-strong)' }}>
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                style={{ left: editingType.is_active ? '22px' : '2px' }} />
            </button>
            <span className="text-sm font-medium">{editingType.is_active ? 'Activo — visible para agendar' : 'Inactivo — oculto'}</span>
          </div>

          {/* Extra Fields */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Campos del formulario</label>
              <button onClick={addExtraField}
                className="px-3 py-1.5 rounded-[8px] text-xs font-semibold cursor-pointer border-2 transition-all bg-transparent"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontFamily: 'inherit' }}>
                + Agregar campo
              </button>
            </div>

            <div className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
              Nombre y email se piden siempre. Agrega campos extra como nombre del startup, link al deck, etc.
            </div>

            {editingType.extra_fields.length === 0 ? (
              <div className="text-center py-6 rounded-[12px] border-2 border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
                <div className="text-sm">Sin campos extra — solo se pedirá nombre, email y notas</div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {editingType.extra_fields.map((field, i) => (
                  <div key={i} className="rounded-[12px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-alt)' }}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Etiqueta</label>
                        <input className="form-input" value={field.label} onChange={e => updateExtraField(i, { label: e.target.value })} placeholder="Ej: Nombre del startup" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Placeholder</label>
                        <input className="form-input" value={field.placeholder} onChange={e => updateExtraField(i, { placeholder: e.target.value })} placeholder="Ej: TuStartup.com" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Tipo</label>
                        <select className="form-input" value={field.type || 'text'} onChange={e => updateExtraField(i, { type: e.target.value })}>
                          <option value="text">Texto corto</option>
                          <option value="textarea">Texto largo</option>
                          <option value="url">URL / Link</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={field.required} onChange={e => updateExtraField(i, { required: e.target.checked })} />
                        Obligatorio
                      </label>
                      <button onClick={() => removeExtraField(i)}
                        className="text-xs font-semibold cursor-pointer bg-transparent border-none"
                        style={{ color: '#C25050', fontFamily: 'inherit' }}>
                        Eliminar campo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button onClick={saveEventType} disabled={typeSaving || !editingType.name.trim()} className="btn-primary">
              {typeSaving ? 'Guardando...' : isNewType ? 'Crear tipo de reunión' : 'Guardar cambios'}
            </button>
            <button onClick={cancelEditing} className="btn-secondary">Cancelar</button>
          </div>
        </div>
      </div>
    )
  }

  // --- Main Settings View ---
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Profile */}
      <div className="rounded-[16px] border p-7" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">👤 Perfil</h2>
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
        <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">⏰ Horario</h2>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm min-w-[60px]" style={{ color: 'var(--text-secondary)' }}>Desde</span>
          <select className="form-input w-[120px]" value={config.start_hour} onChange={e => saveConfig({ start_hour: parseInt(e.target.value) })}>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm min-w-[60px]" style={{ color: 'var(--text-secondary)' }}>Hasta</span>
          <select className="form-input w-[120px]" value={config.end_hour} onChange={e => saveConfig({ end_hour: parseInt(e.target.value) })}>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm min-w-[60px]" style={{ color: 'var(--text-secondary)' }}>Buffer</span>
          <select className="form-input w-[120px]" value={config.buffer_minutes} onChange={e => saveConfig({ buffer_minutes: parseInt(e.target.value) })}>
            {[0, 5, 10, 15, 20, 30, 45, 60].map(m => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>entre reuniones</span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm min-w-[60px]" style={{ color: 'var(--text-secondary)' }}>Ventana</span>
          <select className="form-input w-[120px]" value={config.max_days_ahead} onChange={e => saveConfig({ max_days_ahead: parseInt(e.target.value) })}>
            {[7, 14, 21, 30, 45, 60, 90].map(d => (
              <option key={d} value={d}>{d} días</option>
            ))}
          </select>
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>hacia adelante</span>
        </div>
      </div>

      {/* Working Days */}
      <div className="rounded-[16px] border p-7 md:col-span-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">📆 Días laborales</h2>
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

      {/* Event Types CRUD */}
      <div className="rounded-[16px] border p-7 md:col-span-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">📋 Tipos de reunión</h2>
          <button onClick={startCreating}
            className="btn-primary text-sm !py-2.5 !px-5">
            + Nuevo tipo
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {eventTypes.map(et => (
            <div key={et.id} className="flex items-center gap-4 px-5 py-4 rounded-[12px] border transition-all hover:shadow-sm"
              style={{ borderColor: 'var(--border)', background: !et.is_active ? 'var(--surface-alt)' : 'var(--surface)' }}>

              <span className="text-2xl">{et.emoji}</span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{et.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}>
                    {et.duration} min
                  </span>
                  {!et.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#FFF5F5', color: '#C25050' }}>
                      Inactivo
                    </span>
                  )}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {siteUrl}/{et.id} · {et.extra_fields.length} campo{et.extra_fields.length !== 1 ? 's' : ''} extra
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button onClick={() => toggleActive(et)}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-semibold cursor-pointer border bg-transparent transition-all"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                  {et.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => startEditing(et)}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-semibold cursor-pointer border-2 bg-transparent transition-all"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontFamily: 'inherit' }}>
                  Editar
                </button>
                {deleteConfirm === et.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => deleteEventType(et.id)}
                      className="px-3 py-1.5 rounded-[8px] text-xs font-semibold cursor-pointer border-none text-white"
                      style={{ background: '#C25050', fontFamily: 'inherit' }}>
                      Confirmar
                    </button>
                    <button onClick={() => setDeleteConfirm(null)}
                      className="px-3 py-1.5 rounded-[8px] text-xs font-semibold cursor-pointer border bg-transparent"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                      No
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirm(et.id)}
                    className="px-3 py-1.5 rounded-[8px] text-xs font-semibold cursor-pointer border bg-transparent transition-all"
                    style={{ borderColor: '#E8B4B4', color: '#C25050', fontFamily: 'inherit' }}>
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Google Calendar */}
      <div className="rounded-[16px] border p-7 md:col-span-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">📅 Google Calendar</h2>
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
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">🔗 Links para compartir</h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>Cada tipo de reunión tiene su propio link directo.</p>

        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Página general</div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-[12px]" style={{ background: 'var(--surface-alt)' }}>
            <div className="flex-1 text-sm font-mono truncate">{siteUrl}</div>
            <button onClick={() => copyLink('', 'general')}
              className="px-4 py-2 rounded-[8px] text-xs font-semibold text-white border-none cursor-pointer" style={{ background: 'var(--accent)', fontFamily: 'inherit' }}>
              {copiedId === 'general' ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Links por tipo</div>
        <div className="flex flex-col gap-2">
          {eventTypes.filter(et => et.is_active).map(et => (
            <div key={et.id} className="flex items-center gap-3 px-4 py-3 rounded-[12px]" style={{ background: 'var(--surface-alt)' }}>
              <span className="text-lg">{et.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{et.name} <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>· {et.duration} min</span></div>
                <div className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{siteUrl}/{et.id}</div>
              </div>
              <button onClick={() => copyLink(`/${et.id}`, et.id)}
                className="px-4 py-2 rounded-[8px] text-xs font-semibold text-white border-none cursor-pointer whitespace-nowrap" style={{ background: 'var(--accent)', fontFamily: 'inherit' }}>
                {copiedId === et.id ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
