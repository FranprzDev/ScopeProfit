import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

const SITE_URL = 'https://scopeprofit.app';
const TITLE = 'ScopeProfit — Cerrá el alcance antes de cotizar, no después';
const DESCRIPTION = 'Chateá con tu cliente por Telegram y salí con un alcance de proyecto claro: requerimientos, riesgos y zonas grises detectadas antes de que te exploten en medio del desarrollo. PDF y Word listos para firmar.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · ScopeProfit' },
  description: DESCRIPTION,
  keywords: ['alcance de proyecto', 'levantamiento de requerimientos', 'propuesta comercial freelance', 'scope creep', 'brief de proyecto', 'cotización de software'],
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
    <html lang="es">
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="ScopeProfit inicio">
            <span className="brand-icon">s<span>p</span></span>Scope<span>Profit</span>
          </Link>
          <nav aria-label="Principal">
            <Link href="/login">Iniciar sesión</Link>
            <Link href="/login" className="nav-enter">Crear cuenta <span aria-hidden>↗</span></Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <span>ScopeProfit · Cobrá por lo que hacés. Cotizá lo que no.</span>
          <span>Tu criterio siempre tiene la última palabra.</span>
        </footer>
      </body>
    </html>
  );
}
