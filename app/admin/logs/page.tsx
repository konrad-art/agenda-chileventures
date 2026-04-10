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

  useEffect(() => { setLoading(true); loadLogs() }, [filter])
  useEffect(() => { loadErrorCount(); runHealthCheck() }, [])

  const levelColor = (level: string) => {
    if (level === 'error') return { bg: '#FFF5F5', color: '#C25050', border: '#E8B4B4' }
    if (level === 'warn') return { bg: '#FFF8E1', color: '#B8860B', border: '#E8D4A0' }
    return { bg: 'var(--surface-alt)', color: 'var(--text-secondary)', border: 'var(--border)' }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-display" style={{ letterSpacing: '-0.2px' }}>Monitoreo</h1>
        <button
          onClick={runHealthCheck}
          disabled={healthLoading}
          className="btn-secondary text-sm"
        >
          {healthLoading ? 'Verificando...' : 'Health Check'}
        </button>
      </div>

      {/* Health Status + Error Count */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 stagger-children">
        {/* Health Status */}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: health?.status === 'healthy' ? 'var(--success-light)' : 'var(--error-light)' }}>
            {health?.status === 'healthy' ? '\u2705' : '\u26A0\uFE0F'}
          </div>
          {health ? (
            <div>
              <div className="stat-value" style={{ color: health.status === 'healthy' ? 'var(--success)' : 'var(--error)' }}>
                {health.status === 'healthy' ? 'OK' : 'Alerta'}
              </div>
              <div className="stat-label">Estado del sistema</div>
            </div>
          ) : (
            <div className="skeleton h-6 w-[100px] rounded-md" />
          )}
        </div>

        {/* Error Count */}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: errorCount24h > 0 ? 'var(--error-light)' : 'var(--surface-alt)' }}>
            {errorCount24h > 0 ? '\uD83D\uDD34' : '\uD83D\uDFE2'}
          </div>
          <div className="stat-value" style={{ color: errorCount24h > 0 ? 'var(--error)' : 'var(--text)' }}>
            {errorCount24h}
          </div>
          <div className="stat-label">Errores (24h)</div>
        </div>

        {/* Last Check */}
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--accent-subtle)' }}>{'\uD83D\uDD51'}</div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {health ? new Date(health.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : <span className="skeleton inline-block h-4 w-[60px] rounded-md" />}
          </div>
          <div className="stat-label">Ultimo check</div>
        </div>
      </div>

      {/* Health Details */}
      {health && health.status === 'degraded' && (
        <div className="rounded-[16px] border p-5 mb-6 animate-scale-in" style={{ background: '#FFF5F5', borderColor: '#E8B4B4' }}>
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
        <div className="text-sm font-semibold hidden sm:block" style={{ color: 'var(--text-secondary)' }}>Filtrar:</div>
        <div className="flex gap-0.5 sm:gap-1 p-1 rounded-[12px]" style={{ background: 'var(--surface-alt)' }}>
          {(['all', 'error', 'warn', 'info'] as const).map(f => (
            <button key={f} onClick={() => { setLoading(true); setFilter(f) }}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-[9px] text-xs sm:text-sm font-medium border-none cursor-pointer transition-all duration-200 ${
                filter === f
                  ? 'bg-[var(--surface)] text-[var(--text)]'
                  : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
              style={filter === f ? { boxShadow: 'var(--shadow-sm)' } : {}}>
              {f === 'all' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Logs */}
      {loading ? (
        <div className="flex flex-col gap-2 stagger-children">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton h-[72px] w-full rounded-[14px]" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-[20px] border p-12 text-center animate-scale-in" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="w-16 h-16 rounded-[18px] flex items-center justify-center text-3xl mx-auto mb-4" style={{ background: 'var(--surface-alt)' }}>
            <span style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))' }}>{'\uD83D\uDCCB'}</span>
          </div>
          <div className="font-semibold">No hay logs {filter !== 'all' ? `de tipo "${filter}"` : ''}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 stagger-children">
          {logs.map(log => {
            const colors = levelColor(log.level)
            const dt = new Date(log.created_at)
            return (
              <div key={log.id} className="rounded-[14px] border px-3 sm:px-4 py-3 flex items-start gap-3 sm:gap-4 transition-all duration-200 hover:shadow-sm"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className={`badge shrink-0 mt-0.5 ${log.level === 'error' ? 'badge-error' : log.level === 'warn' ? 'badge-warn' : 'badge-accent'}`}>
                  {log.level}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{log.message}</div>
                  <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs flex-wrap" style={{ color: 'var(--text-tertiary)' }}>
                    <span>{log.function_name}</span>
                    <span>{dt.toLocaleString('es-CL')}</span>
                    {log.ip && <span className="hidden sm:inline">{log.ip}</span>}
                  </div>
                  {log.context && Object.keys(log.context).length > 0 && (
                    <div className="mt-2 text-xs p-2 rounded-[10px] font-mono overflow-x-auto"
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
