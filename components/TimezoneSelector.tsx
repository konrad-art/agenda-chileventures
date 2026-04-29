'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { COMMON_TZS, getAllTimezones, shortTzLabel } from '@/lib/timezone'

interface Props {
  value: string
  onChange: (tz: string) => void
  hostTz: string  // for the small "host time is..." note when guest TZ differs
}

export default function TimezoneSelector({ value, onChange, hostTz }: Props) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setShowAll(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const tzList = useMemo(() => {
    if (showAll || search) {
      const all = getAllTimezones()
      const q = search.trim().toLowerCase()
      const filtered = q
        ? all.filter((tz) => tz.toLowerCase().includes(q))
        : all
      return filtered.slice(0, 200).map((tz) => ({ tz, label: tz.replace(/_/g, ' ') }))
    }
    return COMMON_TZS
  }, [showAll, search])

  const currentLabel = shortTzLabel(value)

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline cursor-pointer bg-transparent border-0 p-0"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="Cambiar zona horaria"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{currentLabel}</span>
        <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1.5 rounded-[14px] py-1 animate-scale-in"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
            minWidth: 240,
            maxWidth: 320,
            top: '100%',
            left: 0,
          }}
        >
          {(showAll || search) && (
            <div className="px-2 pt-1 pb-1.5">
              <input
                autoFocus
                placeholder="Buscar zona…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-[8px] outline-none"
                style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
              />
            </div>
          )}
          <div className="max-h-[260px] overflow-y-auto slots-scroll">
            {tzList.map(({ tz, label }) => (
              <button
                key={tz}
                onClick={() => {
                  onChange(tz)
                  setOpen(false)
                  setSearch('')
                  setShowAll(false)
                }}
                className="w-full text-left px-3 py-2 text-xs cursor-pointer border-0 bg-transparent hover:bg-[color:var(--surface-alt)]"
                style={{
                  color: tz === value ? 'var(--accent)' : 'var(--text)',
                  fontWeight: tz === value ? 600 : 500,
                }}
              >
                {label}
              </button>
            ))}
            {tzList.length === 0 && (
              <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                Sin resultados
              </div>
            )}
          </div>
          {!showAll && !search && (
            <div className="border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setShowAll(true)}
                className="w-full text-center px-3 py-2 text-xs font-semibold cursor-pointer border-0 bg-transparent"
                style={{ color: 'var(--accent)' }}
              >
                Ver todas las zonas →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
