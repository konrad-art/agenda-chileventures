'use client'

interface CVMarkProps {
  size?: number
  className?: string
}

// Paper plane icon mark (SVG recreation of the Chile Ventures logo mark)
export function CVMark({ size = 40, className }: CVMarkProps) {
  const h = Math.round(size * 0.72)
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 50 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block' }}
    >
      <polygon points="1,2 48,18 1,18" fill="#62B8DC" />
      <polygon points="1,18 48,18 14,34" fill="#2D8CC2" />
    </svg>
  )
}

// Full logo: CHILE [mark] VENTURES — matches the Chile Ventures brand
export function CVLogoFull({
  height = 22,
  dark = true,
}: {
  height?: number
  dark?: boolean
}) {
  const textColor = dark ? '#0D1B2A' : '#FFFFFF'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, lineHeight: 1 }}>
      <span
        style={{
          fontSize: height,
          fontWeight: 300,
          letterSpacing: '0.12em',
          color: textColor,
          lineHeight: 1,
        }}
      >
        CHILE
      </span>
      <CVMark size={Math.round(height * 1.7)} />
      <span
        style={{
          fontSize: height,
          fontWeight: 800,
          letterSpacing: '0.12em',
          color: textColor,
          lineHeight: 1,
        }}
      >
        VENTURES
      </span>
    </div>
  )
}
