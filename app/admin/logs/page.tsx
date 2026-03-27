'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface LogEntry {
  id: string
  created_at: string
  function_name: string
  level: string
  message: string
  context: Record<string, unknown>
  ip: string | null
  request_id: string | null
}

interface HealthCheck {
  status: 'healthy' | 'degraded'
  timestamp: string
  checks: { name: string; status: 'ok' | 'error'; detail?: string }[]
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all')
  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [errorCount24h, setErrorCount24h] = useState(0)

  const loadLogs = async () => {
    let query = supabase
      .from('app_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (filter !== 'all') {
      query = query.eq('level', filter)
    }

    const { data } = await query
    if (data) setLogs(data)
    setLoading(false)
  }

  const loadErrorCount = async () => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('app_logs')
      .select('id', { count: 'exact', head: true })
      .eq('level', 'error')
      .gte('created_at', dayAgo)

    setErrorCount24h(count || 0)
  }

  const runHealthCheck = async () => {
    setHealthLoading(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/health`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      )
      const data = await res.json()
      setHealth(data)
    } catch {
      setHealth({ status: 'degraded', timestamp: new Date().toISOString(), checks: [{ name: 'connectivity', status: 'error', detail: 'Could not reach health endpoint' }] })
    }
    setHealthLoading(false)
  }

  useEffect(() => { loadLogs() }, [filter])
  useEffect(() => { loadErrorCount(); runHealthCheck() }, [])

  const levelColor = (level: string) => {
    if (level === 'error') return { bg: '#FFF5F5', color: '#C25050', border: '#E8B4B4' }
    if (level === 'warn') return { bg: '#FFF8E1', color: '#B8860B', border: '#E8D4A0' }
    return { bg: 'var(--surface-alt)', color: 'var(--text-secondary)', border: 'var(--border)' }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Monitoreo</h1>
        <button
          onClick={runHealthCheck}
          disabled={healthLoading}
          className="btn-secondary text-sm"
        >
          {healthLoading ? 'Verificando...' : 'Health Check'}
        </button>
      </div>

      {/* Health Status + Error Count */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Health Status */}
        <div className="rounded-[14px] border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Estado</div>
          {health ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: health.status === 'healthy' ? '#4A7C6B' : '#C25050' }} />
              <span className="font-semibold text-lg">{health.status === 'healthy' ? 'Saludable' : 'Con problemas'}</span>
            </div>
          ) : (
            <div style={{ color: 'var(--text-tertiary)' }}>Cargando...</div>
          )}
        </div>

        {/* Error Count */}
        <div className="rounded-[14px] border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Errores (24h)</div>
          <div className="font-semibold text-lg" style={{ color: errorCount24h > 0 ? '#C25050' : 'var(--text)' }}>
            {errorCount24h}
          </div>
        </div>

        {/* Last Check */}
        <div className="rounded-[14px] border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Ultimo check</div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {health ? new Date(health.timestamp).toLocaleString('es-CL') : '—'}
          </div>
        </div>
      </div>

      {/* Health Details */}
      {health && health.status === 'degraded' && (
        <div className="rounded-[14px] border p-5 mb-6" style={{ background: '#FFF5F5', borderColor: '#E8B4B4' }}>
          <div className="font-semibold mb-3" style={{ color: '#C25050' }}>Problemas detectados:</div>
          {health.checks.filter(c => c.status === 'error').map((c, i) => (
            <div key={i} className="text-sm mb-1">
              <strong>{c.name}:</strong> {c.detail || 'Error'}
            </div>
          ))}
        </div>
      )}

      {/* Log Filter */}
      <div className="flex items-center gap-2 mb-4">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Filtrar:</div>
        <div className="flex gap-1 p-1 rounded-[10px]" style={{ background: 'var(--surface-alt)' }}>
          {(['all', 'error', 'warn', 'info'] as const).map(f => (
            <button key={f} onClick={() => { setLoading(true); setFilter(f) }}
              className={`px-4 py-1.5 rounded-[8px] text-sm font-medium border-none cursor-pointer transition-all ${filter === f ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'bg-transparent text-[var(--text-secondary)]'}`}>
              {f === 'all' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>Cargando...</div>
      ) : logs.length === 0 ? (
        <div className="rounded-[16px] border p-12 text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-4xl mb-3">📋</div>
          <div className="font-semibold">No hay logs {filter !== 'all' ? `de tipo "${filter}"` : ''}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {logs.map(log => {
            const colors = levelColor(log.level)
            const dt = new Date(log.created_at)
            return (
              <div key={log.id} className="rounded-[12px] border px-4 py-3 flex items-start gap-4"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="px-2 py-0.5 rounded-[6px] text-xs font-bold uppercase shrink-0 mt-0.5"
                  style={{ background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}>
                  {log.level}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{log.message}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <span>{log.function_name}</span>
                    <span>{dt.toLocaleString('es-CL')}</span>
                    {log.ip && <span>{log.ip}</span>}
                  </div>
                  {log.context && Object.keys(log.context).length > 0 && (
                    <div className="mt-2 text-xs p-2 rounded-[8px] font-mono overflow-x-auto"
                      style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}>
                      {JSON.stringify(log.context, null, 2)}
                    </div>
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
