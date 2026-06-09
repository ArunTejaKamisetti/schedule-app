// Shared app-icon artwork, rendered to PNG by next/og ImageResponse.
// Gradient fills the whole square (maskable-safe); monogram sits in the centre safe zone.
export function IconArt({ size }: { size: number }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #9333ea 100%)',
        position: 'relative',
      }}
    >
      {/* subtle calendar-grid accent */}
      <div style={{ position: 'absolute', top: size * 0.18, display: 'flex', gap: size * 0.05 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: size * 0.07, height: size * 0.07, borderRadius: size * 0.02, background: 'rgba(255,255,255,0.35)' }} />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: size * 0.44,
          fontWeight: 800,
          color: '#ffffff',
          letterSpacing: -size * 0.015,
          fontFamily: 'sans-serif',
          marginTop: size * 0.06,
        }}
      >
        KS
      </div>
    </div>
  )
}
