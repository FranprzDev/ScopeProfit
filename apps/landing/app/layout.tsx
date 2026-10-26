import type { Metadata, Viewport } from 'next';
import { Analytics } from '@/components/analytics';
import { JsonLd } from '@/components/json-ld';
import { BASE_OPEN_GRAPH, DESCRIPTION, TITLE } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';
import { buildSiteJsonLd } from '@/lib/structured-data';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#090a10',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · ScopeProfit' },
  description: DESCRIPTION,
  keywords: [
    'alcance de proyecto',
    'levantamiento de requerimientos',
    'propuesta comercial freelance',
    'scope creep',
    'brief de proyecto',
    'cotización de software',
    'servidor MCP',
    'Model Context Protocol',
  ],
  openGraph: BASE_OPEN_GRAPH,
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <JsonLd data={buildSiteJsonLd()} />
        <Analytics />
      </head>
      <body>{children}</body>
    </html>
  );
}
