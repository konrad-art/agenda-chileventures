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
    return (
      <div className="min-h-screen mesh-bg">
        <div className="sticky top-0 z-50 floating-nav mx-2 sm:mx-4 mt-2 sm:mt-4 rounded-2xl px-4 sm:px-6 py-3 sm:py-3.5">
          <div className="flex items-center gap-3">
            <div className="skeleton w-9 h-9 rounded-[12px]" />
            <div>
              <div className="skeleton h-5 w-[80px] rounded-md mb-1" />
              <div className="skeleton h-3 w-[40px] rounded-md" />
            </div>
          </div>
        </div>
        <div className="max-w-[1100px] mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <div className="skeleton h-[400px] w-full rounded-[20px]" />
        </div>
      </div>
    )
  }

  if (!authenticated) return null

  const navItems = [
    { path: '/admin', label: 'Reservas' },
    { path: '/admin/settings', label: 'Config' },
    { path: '/admin/logs', label: 'Logs' },
  ]

  return (
    <div className="min-h-screen mesh-bg">
      {/* Floating Admin Nav */}
      <div className="sticky top-0 z-50 floating-nav mx-2 sm:mx-4 mt-2 sm:mt-4 rounded-2xl px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[12px] flex items-center justify-center text-white font-bold text-lg" style={{ background: 'var(--accent)' }}>K</div>
          <div className="hidden sm:block">
            <div className="font-semibold text-[15px] leading-tight">Agenda</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Admin</div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 p-1 rounded-[12px]" style={{ background: 'rgba(235,241,247,0.6)' }}>
          {navItems.map(item => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`px-3 sm:px-5 py-2 rounded-[9px] text-xs sm:text-sm font-medium border-none cursor-pointer transition-all duration-200 ${
                pathname === item.path
                  ? 'bg-[var(--surface)] text-[var(--text)]'
                  : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
              style={pathname === item.path ? { boxShadow: 'var(--shadow-sm)' } : {}}
            >{item.label}</button>
          ))}
          <button onClick={handleLogout}
            className="px-3 sm:px-5 py-2 rounded-[9px] text-xs sm:text-sm font-medium border-none cursor-pointer bg-transparent transition-all duration-200 hover:text-[var(--text)]"
            style={{ color: 'var(--text-tertiary)' }}
          >Salir</button>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-3 sm:px-6 py-4 sm:py-8 animate-fade-in">
        {children}
      </div>
    </div>
  )
}
