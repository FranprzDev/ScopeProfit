import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: 'linear-gradient(135deg, #4c1d95 0%, #db2777 100%)',
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
            background: 'rgba(255,255,255,0.2)',
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
        Cerrá el alcance antes de cotizar, desde tu agente de IA.
      </div>
      <div style={{ fontSize: 28, color: '#f0e0ff', marginTop: 32, maxWidth: 900 }}>
        Servidor MCP para ChatGPT, Claude, Cursor y cualquier cliente MCP.
      </div>
    </div>,
    size,
  );
}
