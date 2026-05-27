'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ErrorBoundary]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg, #f8f9fa)' }}>
      <div className="text-center max-w-md px-6">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text, #1a1a2e)' }}>
          Algo salió mal
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary, #666)' }}>
          Hubo un error al cargar la página. Intenta recargar.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer border-none"
            style={{ background: 'var(--accent, #2d8cc2)', color: '#fff' }}
          >
            Reintentar
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer border-none"
            style={{ background: 'var(--surface-alt, #eee)', color: 'var(--text, #333)' }}
          >
            Recargar página
          </button>
        </div>
      </div>
    </div>
  )
}
