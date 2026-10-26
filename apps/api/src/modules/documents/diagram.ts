import { PeleError, render } from 'pele';
import { Resvg } from '@resvg/resvg-js';

const fontFamily = 'DejaVu Sans, Noto Sans, Liberation Sans, sans-serif';
const rasterWidth = 1800;

export interface DiagramImage {
  png: Buffer;
  width: number;
  height: number;
}

export function diagramError(source: string): string | null {
  try {
    render(source, { fontFamily });
    return null;
  } catch (error) {
    if (error instanceof PeleError) return error.message;
    throw error;
  }
}

function resolveVariables(svg: string): string {
  const defaults = new Map<string, string>();
  for (const match of svg.matchAll(/(--_[a-z]+):var\(--pele-[a-z-]+,([^)]+)\)/g))
    if (match[1] && match[2]) defaults.set(match[1], match[2]);
  return svg
    .replace(/style="rx:var\(--_r\)"/g, 'rx="4"')
    .replace(/var\((--_[a-z]+)\)/g, (_, name: string) => defaults.get(name) ?? 'currentColor');
}

export function renderDiagram(source: string): DiagramImage {
  const result = render(source, { fontFamily, responsive: false });
  const resvg = new Resvg(resolveVariables(result.svg), {
    background: '#ffffff',
    fitTo: { mode: 'width', value: rasterWidth },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
  });
  const image = resvg.render();
  return { png: image.asPng(), width: image.width, height: image.height };
}
