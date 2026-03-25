'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CVLogoFull } from '@/components/CVLogo'

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
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <CVLogoFull height={20} dark={true} />
        </div>

        <div className="p-8 rounded-[16px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 4px 24px rgba(13,27,42,0.08)' }}>
          <div className="text-center mb-7">
            <div className="font-bold text-xl" style={{ letterSpacing: '-0.3px' }}>Admin Login</div>
            <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Panel de gestión de agenda</div>
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
              <div className="text-sm font-medium px-4 py-3 rounded-[8px] mb-4" style={{ background: '#FFF5F5', color: '#C25050', border: '1px solid #E8B4B4' }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <div className="text-center mt-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Chile Ventures · Santiago, Chile
        </div>
      </div>
    </div>
  )
}
