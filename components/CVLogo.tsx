'use client'

interface CVMarkProps {
  size?: number
  className?: string
}

// Paper plane icon mark (SVG recreation of the Chile Ventures logo mark)
export function CVMark({ size = 40, className }: CVMarkProps) {
  const h = Math.round(size * 0.9)
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 44 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block' }}
    >
      {/* Upper triangle — light blue */}
      <polygon points="2,2 42,16 18,20" fill="#62B8DC" />
      {/* Lower triangle — dark blue */}
      <polygon points="2,2 18,20 10,38" fill="#2D8CC2" />
      {/* White fold line for depth */}
      <line x1="2" y1="2" x2="18" y2="20" stroke="white" strokeWidth="1.5" opacity="0.6" />
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
  const markSize = Math.round(height * 1.1)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, lineHeight: 1 }}>
      <span
        style={{
          fontSize: height,
          fontWeight: 300,
          letterSpacing: '0.08em',
          color: textColor,
          lineHeight: 1,
        }}
      >
        CHILE
      </span>
      <CVMark size={markSize} />
      <span
        style={{
          fontSize: height,
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: textColor,
          lineHeight: 1,
        }}
      >
        ENTURES
      </span>
    </div>
  )
}
