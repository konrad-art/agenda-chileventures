'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Credenciales incorrectas')
      setLoading(false)
      return
    }

    router.push('/admin')
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm p-8 rounded-[20px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-[12px] flex items-center justify-center text-white font-display font-bold text-xl mx-auto mb-4" style={{ background: 'var(--accent)' }}>K</div>
          <div className="font-display text-xl font-semibold">Admin Login</div>
          <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Agenda Chile Ventures</div>
        </div>

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Email</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
          </div>
          <div className="mb-6">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Contraseña</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          {error && (
            <div className="text-sm font-medium px-4 py-3 rounded-[10px] mb-4" style={{ background: '#FFF5F5', color: '#C25050', border: '1px solid #E8B4B4' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
