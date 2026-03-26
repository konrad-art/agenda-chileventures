'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function AuthConfirmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          router.push('/login?error=auth')
        } else {
          router.push('/admin')
        }
      })
    } else {
      router.push('/login?error=auth')
    }
  }, [searchParams, router])

  return (
    <div className="text-center">
      <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Autenticando...</div>
      <div className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>Un momento por favor</div>
    </div>
  )
}

export default function AuthConfirm() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Suspense fallback={
        <div className="text-center">
          <div className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Cargando...</div>
        </div>
      }>
        <AuthConfirmInner />
      </Suspense>
    </div>
  )
}
