'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setAuthenticated(true)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/login')
    })

    return () => subscription.unsubscribe()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>Cargando...</div>
  }

  if (!authenticated) return null

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Admin Top Bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white font-display font-bold text-lg" style={{ background: 'var(--accent)' }}>K</div>
          <div>
            <div className="font-display font-semibold text-lg">Agenda</div>
            <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Admin</div>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-[12px]" style={{ background: 'var(--surface-alt)' }}>
          <button
            onClick={() => router.push('/admin')}
            className={`px-5 py-2 rounded-[9px] text-sm font-medium border-none cursor-pointer transition-all ${pathname === '/admin' ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'bg-transparent text-[var(--text-secondary)]'}`}
          >Reservas</button>
          <button
            onClick={() => router.push('/admin/settings')}
            className={`px-5 py-2 rounded-[9px] text-sm font-medium border-none cursor-pointer transition-all ${pathname === '/admin/settings' ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'bg-transparent text-[var(--text-secondary)]'}`}
          >Config</button>
          <button onClick={handleLogout}
            className="px-5 py-2 rounded-[9px] text-sm font-medium border-none cursor-pointer bg-transparent text-[var(--text-secondary)] hover:text-[var(--text)]"
          >Salir</button>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto p-8">
        {children}
      </div>
    </div>
  )
}
