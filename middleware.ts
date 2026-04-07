import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Use getUser() (not getSession) — validates JWT against Supabase Auth
  const { data: { user } } = await supabase.auth.getUser()

  const isProtected =
    req.nextUrl.pathname.startsWith('/admin') ||
    req.nextUrl.pathname.startsWith('/preview-email')

  if (isProtected) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // H3: enforce admin allowlist against the admins table
    if (user.email) {
      const { data: admin } = await supabase
        .from('admins')
        .select('email')
        .eq('email', user.email)
        .maybeSingle()

      if (!admin) {
        // Sign out and redirect to login with error flag
        await supabase.auth.signOut()
        const url = new URL('/login', req.url)
        url.searchParams.set('error', 'unauthorized')
        return NextResponse.redirect(url)
      }
    } else {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  return res
}

export const config = {
  matcher: ['/admin/:path*', '/preview-email/:path*'],
}
