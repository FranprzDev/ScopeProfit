import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #171321 0%, #2a1f3d 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: '#8b5cf6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            sp
          </div>
          <span style={{ fontSize: 32, fontWeight: 700 }}>ScopeProfit</span>
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.15, maxWidth: 980 }}>
          Dejá de perder plata en el trabajo que nadie cotizó.
        </div>
        <div style={{ fontSize: 28, color: '#c9c3d9', marginTop: 32, maxWidth: 900 }}>
          El chat de Telegram con tu cliente, convertido en un alcance de proyecto claro.
        </div>
      </div>
    ),
    size
  );
}
