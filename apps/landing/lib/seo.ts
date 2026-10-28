import type { Metadata } from 'next';
import { SitePath } from './site';

export const SITE_NAME = 'ScopeProfit';
export const SITE_LOCALE = 'es_AR';
export const SITE_LANGUAGE = 'es';

export const TITLE = 'ScopeProfit | Del pedido al alcance';
export const DESCRIPTION =
  'ScopeProfit le da herramientas a tu agente de IA para convertir pedidos de clientes en un alcance claro, con requisitos citados y exportación a PDF y Word. Open source y autohospedado.';

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
