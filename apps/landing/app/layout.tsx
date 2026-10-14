import type { Metadata, Viewport } from 'next';
import { Libre_Franklin, Source_Serif_4 } from 'next/font/google';
import { SITE_URL } from '@/lib/site';
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

export const viewport: Viewport = {
  themeColor: '#eef0f3',
};

const TITLE = 'ScopeProfit — Servidor MCP para cerrar el alcance antes de cotizar';
const DESCRIPTION =
  'Scope-to-Profit es un servidor MCP: desde ChatGPT, Claude, Cursor o tu propio agente convertís la idea desordenada de un cliente en un documento de alcance versionado, con requerimientos citados, preguntas bloqueantes, riesgos y rango de horas. Exporta PDF y Word.';

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
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: SITE_URL,
    siteName: 'ScopeProfit',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ScopeProfit',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: DESCRIPTION,
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${display.variable} ${text.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
