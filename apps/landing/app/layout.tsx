import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Serif, IBM_Plex_Mono } from 'next/font/google';
import { Analytics } from '@/components/analytics';
import { JsonLd } from '@/components/json-ld';
import { BASE_OPEN_GRAPH, DESCRIPTION, TITLE } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';
import { buildSiteJsonLd } from '@/lib/structured-data';
import './globals.css';

const displaySans = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const accentSerif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-accent',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

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
      </head>
      <body className={`${displaySans.variable} ${accentSerif.variable} ${plexMono.variable}`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
