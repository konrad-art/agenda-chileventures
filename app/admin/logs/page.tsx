'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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

const LEVELS = ['all', 'error', 'warn', 'info'] as const
const FUNCTIONS = ['all', 'book', 'reschedule', 'availability', 'availability-month', 'google-auth', 'health'] as const
const AUTO_REFRESH_MS = 30_000

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof LEVELS)[number]>('all')
  const [fnFilter, setFnFilter] = useState<(typeof FUNCTIONS)[number]>('all')
  const [search, setSearch] = useState('')
  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [errorCount24h, setErrorCount24h] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadLogs = useCallback(async () => {
    let query = supabase
      .from('app_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (filter !== 'all') query = query.eq('level', filter)
    if (fnFilter !== 'all') query = query.eq('function_name', fnFilter)
    if (search.trim()) query = query.ilike('message', `%${search.trim()}%`)

    const { data } = await query
    if (data) setLogs(data)
    setLoading(false)
  }, [filter, fnFilter, search])

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
      setHealth({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        checks: [{ name: 'connectivity', status: 'error', detail: 'No se pudo conectar al endpoint' }],
      })
    }
    setHealthLoading(false)
  }

  // Load logs when filters change (debounce search)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true)
      loadLogs()
    }, search ? 300 : 0)
    return () => clearTimeout(timeout)
  }, [filter, fnFilter, search, loadLogs])

  // Initial load
  useEffect(() => {
    loadErrorCount()
    runHealthCheck()
  }, [])

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        loadLogs()
        loadErrorCount()
      }, AUTO_REFRESH_MS)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, loadLogs])

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-display" style={{ letterSpacing: '-0.2px' }}>Monitoreo</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`px-3 py-1.5 rounded-[10px] text-xs font-medium border transition-all duration-200 cursor-pointer ${
              autoRefresh
                ? 'bg-[var(--success-light)] text-[var(--success)] border-[var(--success)]'
                : 'bg-[var(--surface-alt)] text-[var(--text-secondary)] border-[var(--border)]'
            }`}
          >
            {autoRefresh ? '● Live' : '○ Live'}
          </button>
          <button
            onClick={runHealthCheck}
            disabled={healthLoading}
            className="btn-secondary text-sm"
          >
            {healthLoading ? 'Verificando...' : 'Health Check'}
          </button>
        </div>
      </div>

      {/* Health Status + Error Count */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 stagger-children">
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

        <div className="stat-card">
          <div className="stat-icon" style={{ background: errorCount24h > 0 ? 'var(--error-light)' : 'var(--surface-alt)' }}>
            {errorCount24h > 0 ? '\uD83D\uDD34' : '\uD83D\uDFE2'}
          </div>
          <div className="stat-value" style={{ color: errorCount24h > 0 ? 'var(--error)' : 'var(--text)' }}>
            {errorCount24h}
          </div>
          <div className="stat-label">Errores (24h)</div>
        </div>

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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-4">
        {/* Level filter */}
        <div className="flex gap-0.5 sm:gap-1 p-1 rounded-[12px]" style={{ background: 'var(--surface-alt)' }}>
          {LEVELS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
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

        {/* Function filter */}
        <select
          value={fnFilter}
          onChange={e => setFnFilter(e.target.value as (typeof FUNCTIONS)[number])}
          className="px-3 py-2 rounded-[10px] text-xs sm:text-sm border cursor-pointer"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          <option value="all">Todas las funciones</option>
          {FUNCTIONS.filter(f => f !== 'all').map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar en mensajes..."
          className="px-3 py-2 rounded-[10px] text-xs sm:text-sm border w-full sm:w-[220px]"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
        />
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
                    <span className="font-mono">{log.function_name}</span>
                    <span>{dt.toLocaleString('es-CL')}</span>
                    {log.request_id && <span className="font-mono hidden sm:inline">#{log.request_id}</span>}
                    {log.ip && <span className="hidden sm:inline">{log.ip}</span>}
                  </div>
                  {log.context && Object.keys(log.context).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>
                        Contexto
                      </summary>
                      <div className="mt-1 text-xs p-2 rounded-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all"
                        style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}>
                        {JSON.stringify(log.context, null, 2)}
                      </div>
                    </details>
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
