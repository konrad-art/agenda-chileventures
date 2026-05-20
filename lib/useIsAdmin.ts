// Hook: is the current visitor a logged-in admin?
// Returns { isAdmin, loading }. Anonymous visitors always get { isAdmin: false }.
//
// We need this on the public booking page so we can conditionally surface
// admin-only tools (e.g. the "Link Email" button on each event-type card)
// without exposing them to guests.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface AdminState {
  isAdmin: boolean
  loading: boolean
}

export function useIsAdmin(): AdminState {
  const [state, setState] = useState<AdminState>({ isAdmin: false, loading: true })

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const email = session?.user?.email
        if (!email) {
          if (!cancelled) setState({ isAdmin: false, loading: false })
          return
        }
        // The admins table has RLS that only allows reads to authenticated users
        // whose email matches a row, so this returns the row only if you're an
        // admin. A non-admin authenticated user gets `null`.
        const { data: admin } = await supabase
          .from('admins')
          .select('email')
          .eq('email', email)
          .maybeSingle()
        if (!cancelled) setState({ isAdmin: !!admin, loading: false })
      } catch {
        if (!cancelled) setState({ isAdmin: false, loading: false })
      }
    }

    check()

    // Re-check when auth state changes (login / logout in another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => check())
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return state
}
