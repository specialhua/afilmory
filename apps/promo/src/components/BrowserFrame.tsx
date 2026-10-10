import type { ReactNode } from 'react'

import { color, font } from '../theme'

const BAR = 44

export function BrowserFrame({ width, children }: { width: number, children: ReactNode }) {
  const height = width / 1.6 + BAR
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
        overflow: 'hidden',
        background: '#1c1c1e',
        boxShadow: `0 0 0 1px ${color.hairline}, 0 40px 120px rgba(0,0,0,.65), 0 12px 32px rgba(0,0,0,.4)`,
      }}
    >
      <div
        style={{
          height: BAR,
          display: 'flex',
          alignItems: 'center',
          padding: '0 18px',
          gap: 8,
          borderBottom: `1px solid ${color.hairline}`,
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map(c => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
        ))}
        <div
          style={{
            margin: '0 auto',
            width: 360,
            height: 28,
            borderRadius: 8,
            background: 'rgba(255,255,255,.07)',
            color: color.secondary,
            fontFamily: font,
            fontSize: 14,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          innei.afilmory.art
        </div>
        <span style={{ width: 52 }} />
      </div>
      <div style={{ width, height: width / 1.6, position: 'relative' }}>{children}</div>
    </div>
  )
}
