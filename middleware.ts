import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dewvghsgsdhaggesvkhx.supabase.co'

function buildCsp(nonce: string): string {
  // L1: nonce-based CSP — no 'unsafe-inline' for scripts.
  // 'strict-dynamic' lets scripts loaded by nonce'd scripts run (needed for Next.js chunk loading).
  return [
    "default-src 'self'",
    `connect-src 'self' ${SUPABASE_URL} https://accounts.google.com https://fonts.googleapis.com`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export async function middleware(req: NextRequest) {
  // Per-request CSP nonce (base64, 16 bytes of entropy)
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  const nonce = btoa(String.fromCharCode(...nonceBytes))

  // Forward nonce to the app via request header so RSC layouts can read it
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', buildCsp(nonce))

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', buildCsp(nonce))

  // Auth gating only for protected paths
  const isProtected =
    req.nextUrl.pathname.startsWith('/admin') ||
    req.nextUrl.pathname.startsWith('/preview-email')

  if (!isProtected) {
    return res
  }

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
      await supabase.auth.signOut()
      const url = new URL('/login', req.url)
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  } else {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  // Run on all paths except static assets and API routes so CSP header is always set.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|otf|eot|css|js|map)).*)',
  ],
}
