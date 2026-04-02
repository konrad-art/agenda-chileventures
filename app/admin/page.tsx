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

  useEffect(() => { setLoading(true); loadBookings() }, [filter])

  const handleCancel = async (id: string) => {
    await supabase.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id)
    loadBookings()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold" style={{ letterSpacing: '-0.3px' }}>Reservas</h1>
          <a href={process.env.NEXT_PUBLIC_SITE_URL || 'https://agenda-chileventures.vercel.app'} target="_blank" rel="noopener noreferrer"
            className="btn-sm no-underline inline-flex items-center gap-1.5 !py-2 !px-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agendar
          </a>
        </div>
        <div className="pill-tabs">
          {(['upcoming', 'past', 'cancelled'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`pill-tab ${filter === f ? 'active' : ''}`}>
              {f === 'upcoming' ? 'Próximas' : f === 'past' ? 'Pasadas' : 'Canceladas'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 stagger-children">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton h-[88px] w-full rounded-[16px]" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="card p-12 text-center animate-scale-in">
          <div className="w-16 h-16 rounded-[18px] flex items-center justify-center text-3xl mx-auto mb-4" style={{ background: 'var(--surface-alt)' }}>
            <span style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))' }}>&#128237;</span>
          </div>
          <div className="font-semibold">No hay reservas {filter === 'upcoming' ? 'próximas' : filter === 'past' ? 'pasadas' : 'canceladas'}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 stagger-children">
          {bookings.map(b => {
            const dt = new Date(b.datetime)
            const et = b.event_types as any
            return (
              <div key={b.id} className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 transition-all duration-200 hover:shadow-md">
                <div className="flex items-center sm:block text-center min-w-[52px] gap-3 sm:gap-0">
                  <div className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                    {MONTHS_ES[dt.getMonth()].slice(0, 3)}
                  </div>
                  <div className="text-2xl font-bold" style={{ letterSpacing: '-0.5px' }}>{dt.getDate()}</div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {String(dt.getHours()).padStart(2, '0')}:{String(dt.getMinutes()).padStart(2, '0')}
                  </div>
                </div>

                <div className="hidden sm:block h-12 w-px" style={{ background: 'var(--border)' }} />

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">{b.name}</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{b.email}</div>
                  {b.extras?.startup && (
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>&#127970; {b.extras.startup}</div>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold" style={{ background: 'var(--surface-alt)' }}>
                    {et?.emoji} {et?.name} &middot; {b.duration}min
                  </div>

                  {filter === 'upcoming' && (
                    <button onClick={() => handleCancel(b.id)}
                      className="btn-sm hover:!bg-[var(--error-light)]"
                      style={{ background: 'var(--error-light)', color: 'var(--error)', borderColor: 'var(--error-border)', fontFamily: 'inherit' }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
