import { ImageResponse } from 'next/og';

export interface IconSize {
  width: number;
  height: number;
}

const BRAND_CRIMSON = '#b01e2f';
/** Glyph size relative to the icon edge, taken from the original 64px icon (34 / 64). */
const GLYPH_RATIO = 34 / 64;

/** The "sp" brand mark used by the favicon and the Apple touch icon. */
export function renderBrandIcon(size: IconSize): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND_CRIMSON,
        borderRadius: 0,
        color: '#fff',
        fontSize: Math.round(size.width * GLYPH_RATIO),
        fontWeight: 800,
        fontFamily: 'sans-serif',
      }}
    >
      sp
    </div>,
    size,
  );
}
