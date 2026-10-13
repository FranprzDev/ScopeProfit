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
        background: '#eef0f3',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          height: 330,
          padding: '0 72px 24px',
          color: '#1f2de6',
        }}
      >
        <span
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: '#0b0c0e',
            marginBottom: 'auto',
            paddingTop: 48,
          }}
        >
          ScopeProfit
        </span>
        <span style={{ fontSize: 132, fontWeight: 800, letterSpacing: -5, lineHeight: 0.9 }}>
          CERRÁ EL ALCANCE
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          padding: '0 72px',
          background: '#1f2de6',
          color: '#ffffff',
          fontSize: 36,
          lineHeight: 1.25,
        }}
      >
        Servidor MCP: desde ChatGPT, Claude, Cursor o tu propio agente, un documento de alcance
        versionado antes de cotizar.
      </div>
    </div>,
    size,
  );
}
