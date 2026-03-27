'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Booking } from '@/lib/types'
import { DAYS_ES, MONTHS_ES } from '@/lib/helpers'

export default function AdminPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming')

  const loadBookings = async () => {
    const now = new Date().toISOString()
    let query = supabase.from('bookings').select('*, event_types(name, emoji, color)').order('datetime', { ascending: true })

    if (filter === 'upcoming') {
      query = query.eq('status', 'confirmed').gte('datetime', now)
    } else if (filter === 'past') {
      query = query.eq('status', 'confirmed').lt('datetime', now)
    } else {
      query = query.eq('status', 'cancelled')
    }

    const { data } = await query
    if (data) setBookings(data)
    setLoading(false)
  }

  useEffect(() => { loadBookings() }, [filter])

  const handleCancel = async (id: string) => {
    await supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id)
    loadBookings()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">📋 Reservas</h1>
        <div className="flex gap-1 p-1 rounded-[10px]" style={{ background: 'var(--surface-alt)' }}>
          {(['upcoming', 'past', 'cancelled'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-[8px] text-sm font-medium border-none cursor-pointer transition-all ${filter === f ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'bg-transparent text-[var(--text-secondary)]'}`}>
              {f === 'upcoming' ? 'Próximas' : f === 'past' ? 'Pasadas' : 'Canceladas'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Cargando...</div>
      ) : bookings.length === 0 ? (
        <div className="rounded-[16px] border p-12 text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-4xl mb-3">📭</div>
          <div className="font-semibold">No hay reservas {filter === 'upcoming' ? 'próximas' : filter === 'past' ? 'pasadas' : 'canceladas'}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {bookings.map(b => {
            const dt = new Date(b.datetime)
            const et = b.event_types as any
            return (
              <div key={b.id} className="rounded-[14px] border p-5 flex items-center gap-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="text-center min-w-[52px]">
                  <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                    {MONTHS_ES[dt.getMonth()].slice(0, 3)}
                  </div>
                  <div className="text-2xl font-bold" style={{ letterSpacing: '-0.5px' }}>{dt.getDate()}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {String(dt.getHours()).padStart(2, '0')}:{String(dt.getMinutes()).padStart(2, '0')}
                  </div>
                </div>

                <div className="h-12 w-px" style={{ background: 'var(--border)' }} />

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">{b.name}</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{b.email}</div>
                  {b.extras?.startup && (
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>🏢 {b.extras.startup}</div>
                  )}
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-xs font-semibold" style={{ background: 'var(--surface-alt)' }}>
                  {et?.emoji} {et?.name} · {b.duration}min
                </div>

                {filter === 'upcoming' && (
                  <button onClick={() => handleCancel(b.id)}
                    className="px-3 py-1.5 rounded-[8px] text-xs font-semibold cursor-pointer border"
                    style={{ background: '#FFF5F5', color: '#C25050', borderColor: '#E8B4B4', fontFamily: 'inherit' }}>
                    Cancelar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
