import { existsSync } from 'node:fs';
import path from 'node:path';
import { PeleError, render } from 'pele';
import { Resvg } from '@resvg/resvg-js';

const fontFamily = 'DejaVu Sans, Noto Sans, Liberation Sans, sans-serif';
const sketchFontFamily = 'Patrick Hand, DejaVu Sans, sans-serif';
const sketchFontFile = 'PatrickHand-Regular.ttf';
const sketchFontScale = 1.2;
const rasterWidth = 1800;

export enum DiagramStyle {
  Clean = 'clean',
  Sketch = 'sketch',
}

const sketchPalette: Record<string, string> = {
  '--_bg': '#fdfaf3',
  '--_fg': '#2f2a24',
  '--_m': '#8a7d6b',
  '--_l': '#4a4238',
  '--_s': '#fdf6e3',
  '--_a': '#f5e8ce',
  '--_b': '#6b5d4f',
  '--_c': '#c2562f',
  '--_fm': sketchFontFamily,
};

const sketchSeries = [
  '#c2562f',
  '#4f6f8f',
  '#7a8c4f',
  '#b08945',
  '#8c5b7b',
  '#4f7a6b',
  '#a8552f',
  '#6b5d8c',
];

const sketchFilter =
  '<defs><filter id="sketch" x="-5%" y="-5%" width="110%" height="110%">' +
  '<feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="4" seed="7" result="noise"/>' +
  '<feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6"/>' +
  '</filter></defs>';

export interface DiagramImage {
  png: Buffer;
  width: number;
  height: number;
  naturalWidth: number;
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

function scaleFontSize(size: string): string {
  return String(Math.round(parseFloat(size) * sketchFontScale * 100) / 100);
}

function sketchSvg(svg: string): string {
  return svg
    .replace(
      /(--_[a-z]+):var\(--pele-[a-z-]+,[^)]+\)/g,
      (_, name: string) => `${name}:${sketchPalette[name] ?? 'currentColor'}`,
    )
    .replace(/var\(--pele-font(-mono)?,[^)]+\)/g, sketchFontFamily)
    .replace(/style="rx:var\(--_r\)"/g, 'rx="6"')
    .replace(/var\((--_[a-z]+)\)/g, (_, name: string) => sketchPalette[name] ?? 'currentColor')
    .replace(
      /var\(--pele-series-(\d+),[^)]+\)/g,
      (_, index: string) => sketchSeries[(parseInt(index, 10) - 1) % sketchSeries.length],
    )
    .replace(/var\(--pele-[a-z0-9-]+,([^)]+)\)/g, (_, fallback: string) => fallback)
    .replace(/font:(\d+(?:\.\d+)?)px/g, (_, size: string) => `font:${scaleFontSize(size)}px`)
    .replace(
      /font-size="(\d+(?:\.\d+)?)"/g,
      (_, size: string) => `font-size="${scaleFontSize(size)}"`,
    )
    .replace(
      /(<svg[^>]*>)([\s\S]*)<\/svg>/,
      `$1${sketchFilter}<g filter="url(#sketch)">$2</g></svg>`,
    );
}

let cachedSketchFonts: string[] | null = null;

function sketchFontFiles(): string[] {
  if (cachedSketchFonts) return cachedSketchFonts;
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'assets', 'fonts', sketchFontFile),
    path.resolve(__dirname, '..', '..', '..', '..', 'assets', 'fonts', sketchFontFile),
  ];
  cachedSketchFonts = candidates.filter((candidate) => existsSync(candidate));
  return cachedSketchFonts;
}

export function defaultDiagramStyle(): DiagramStyle {
  return process.env.DIAGRAM_STYLE === DiagramStyle.Sketch
    ? DiagramStyle.Sketch
    : DiagramStyle.Clean;
}

export function renderDiagram(
  source: string,
  style: DiagramStyle = defaultDiagramStyle(),
): DiagramImage {
  const sketch = style === DiagramStyle.Sketch;
  const result = render(source, {
    fontFamily: sketch ? sketchFontFamily : fontFamily,
    responsive: false,
  });
  const resvg = new Resvg(sketch ? sketchSvg(result.svg) : resolveVariables(result.svg), {
    background: sketch ? sketchPalette['--_bg'] : '#ffffff',
    fitTo: { mode: 'width', value: rasterWidth },
    font: {
      fontFiles: sketch ? sketchFontFiles() : [],
      loadSystemFonts: true,
      defaultFontFamily: sketch ? 'Patrick Hand' : 'DejaVu Sans',
    },
  });
  const image = resvg.render();
  return {
    png: image.asPng(),
    width: image.width,
    height: image.height,
    naturalWidth: result.width,
  };
}

export type DiagramRenderer = (source: string) => DiagramImage;

export function memoizedDiagramRenderer(
  style: DiagramStyle = defaultDiagramStyle(),
): DiagramRenderer {
  const cache = new Map<string, DiagramImage>();
  return (source) => {
    const cached = cache.get(source);
    if (cached) return cached;
    const image = renderDiagram(source, style);
    cache.set(source, image);
    return image;
  };
}
