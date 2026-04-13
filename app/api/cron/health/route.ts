// Vercel Cron: calls the Supabase health endpoint every hour
// The health endpoint handles alerts if anything is degraded

import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: Request) {
  // Verify the request comes from Vercel Cron (CRON_SECRET auto-provided on Pro plan)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Missing SUPABASE_URL' }, { status: 500 })
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    const data = await res.json()

    return NextResponse.json({
      status: data.status,
      timestamp: data.timestamp,
      checks: data.checks?.length ?? 0,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Health check failed', detail: String(err) },
      { status: 502 }
    )
  }
}
