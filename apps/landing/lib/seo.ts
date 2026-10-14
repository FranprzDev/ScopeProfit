import type { Metadata } from 'next';
import { SitePath } from './site';

export const SITE_NAME = 'ScopeProfit';
export const SITE_LOCALE = 'es_AR';
export const SITE_LANGUAGE = 'es';

export const TITLE = 'ScopeProfit — Servidor MCP para cerrar el alcance antes de cotizar';
export const DESCRIPTION =
  'Scope-to-Profit es un servidor MCP: desde ChatGPT, Claude, Cursor o tu propio agente convertís la idea desordenada de un cliente en un documento de alcance versionado, con requerimientos citados, preguntas bloqueantes, riesgos y rango de horas. Exporta PDF y Word.';

type OpenGraph = NonNullable<Metadata['openGraph']>;

/** Site-wide Open Graph fields. Each page adds its own `url` through `buildPageMetadata`. */
export const BASE_OPEN_GRAPH: OpenGraph = {
  type: 'website',
  locale: SITE_LOCALE,
  siteName: SITE_NAME,
  title: TITLE,
  description: DESCRIPTION,
};

/**
 * Per-page canonical and Open Graph URL. Relative paths resolve against `metadataBase`
 * (set in the root layout), so every route declares itself as canonical instead of the root.
 */
export function buildPageMetadata(path: SitePath): Metadata {
  return {
    alternates: { canonical: path },
    openGraph: { ...BASE_OPEN_GRAPH, url: path },
  };
}
