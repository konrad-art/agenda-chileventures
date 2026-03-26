'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CVLogoFull } from '@/components/CVLogo'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // Clear any stale client-side session on mount to prevent loops
  useEffect(() => {
    supabase.auth.signOut()
  }, [])

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError('Error al iniciar sesión con Google')
      setLoading(false)
    }
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

          {error && (
            <div className="text-sm font-medium px-4 py-3 rounded-[8px] mb-4" style={{ background: '#FFF5F5', color: '#C25050', border: '1px solid #E8B4B4' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-[12px] text-[15px] font-semibold cursor-pointer border-2 transition-all hover:shadow-md"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {loading ? 'Conectando...' : 'Continuar con Google'}
          </button>

          <div className="text-center mt-5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Solo acceso autorizado para administradores
          </div>
        </div>

        <div className="text-center mt-6 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Chile Ventures · Santiago, Chile
        </div>
      </div>
    </div>
  )
}
