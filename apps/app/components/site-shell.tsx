'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname === '/login') return null;

  return (
    <header className="site-header">
      <Link className="brand" href="/dashboard" aria-label="ScopeProfit Panel">
        <span className="brand-icon">s<span>p</span></span>Scope<span>Profit</span>
      </Link>
      <nav aria-label="Principal">
        <Link href="/dashboard">Proyectos</Link>
        <Link href="/settings">Configuración</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>ScopeProfit · Cobrá por lo que hacés. Cotizá lo que no.</span>
      <span>Tu criterio siempre tiene la última palabra.</span>
    </footer>
  );
}
