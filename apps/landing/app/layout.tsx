import type { Metadata, Viewport } from 'next';
import { Libre_Franklin, Source_Serif_4 } from 'next/font/google';
import { Analytics } from '@/components/analytics';
import { JsonLd } from '@/components/json-ld';
import { BASE_OPEN_GRAPH, DESCRIPTION, TITLE } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';
import { buildSiteJsonLd } from '@/lib/structured-data';
import './globals.css';

const display = Libre_Franklin({
  subsets: ['latin'],
  weight: '700',
  variable: '--font-display',
  display: 'swap',
});

const text = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-text',
  display: 'swap',
});

/** Zoom stays allowed (up to 5x) for accessibility; the theme color matches `--bg`. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#eef0f3',
};

/**
 * Site-wide defaults only. The canonical URL is not set here: each page declares its own
 * through `buildPageMetadata`, so no route inherits the root as its canonical.
 */
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
    <html lang="es" className={`${display.variable} ${text.variable}`}>
      <head>
        <JsonLd data={buildSiteJsonLd()} />
        <Analytics />
      </head>
      <body>{children}</body>
    </html>
  );
}
