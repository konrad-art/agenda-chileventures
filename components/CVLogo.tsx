'use client'

import Image from 'next/image'

// Full logo using the official Chile Ventures PNG
export function CVLogoFull({
  height = 22,
}: {
  height?: number
}) {
  // Original image aspect ratio is roughly 5.2:1
  const width = Math.round(height * 5.2)
  return (
    <Image
      src="/logo-chileventures.png"
      alt="Chile Ventures"
      width={width}
      height={height}
      priority
      style={{ height, width: 'auto' }}
    />
  )
}

// Small mark-only version for favicon/compact uses
export function CVMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo-chileventures.png"
      alt="Chile Ventures"
      width={size * 3}
      height={size}
      className={className}
      style={{ height: size, width: 'auto' }}
    />
  )
}
