import { INSTITUTION_SHORT_NAME } from './branding'

// The short institution tag shown on the icon, derived from branding (e.g. "IIM-K" → "IIMK"), so the
// app icon follows the deployment instead of a hardcoded "IIMK". Letters/digits only, capped so it
// stays inside the safe zone.
const ICON_LABEL = (INSTITUTION_SHORT_NAME || 'Campus').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 5) || 'CAMPUS'

// Shared app-icon artwork, rendered to PNG by next/og ImageResponse.
// Gradient fills the whole square (maskable-safe); text sits in the centre safe zone.
export function IconArt({ size }: { size: number }) {
  // Scale the font down a touch for longer tags so 5 characters still fit the square.
  const labelFont = size * (ICON_LABEL.length <= 4 ? 0.3 : 0.22)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(140deg, #4338ca 0%, #6d28d9 50%, #9333ea 100%)',
        position: 'relative',
      }}
    >
      {/* glossy top sheen */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%', background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0))', display: 'flex' }} />
      {/* calendar-dot accent */}
      <div style={{ display: 'flex', gap: size * 0.045, marginBottom: size * 0.04 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: size * 0.06, height: size * 0.06, borderRadius: size * 0.018, background: 'rgba(255,255,255,0.45)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: labelFont, fontWeight: 800, color: '#ffffff', letterSpacing: -size * 0.012, fontFamily: 'sans-serif', lineHeight: 1 }}>
        {ICON_LABEL}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.03, marginTop: size * 0.045 }}>
        <div style={{ width: size * 0.14, height: size * 0.012, borderRadius: 99, background: 'rgba(255,255,255,0.6)', display: 'flex' }} />
        <div style={{ display: 'flex', fontSize: size * 0.11, fontWeight: 800, color: '#fde68a', fontFamily: 'sans-serif', lineHeight: 1 }}>S</div>
        <div style={{ width: size * 0.14, height: size * 0.012, borderRadius: 99, background: 'rgba(255,255,255,0.6)', display: 'flex' }} />
      </div>
    </div>
  )
}
