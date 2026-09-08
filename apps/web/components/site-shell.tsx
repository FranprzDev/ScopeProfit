'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname === '/' || pathname === '/faq' || pathname === '/status') return null;

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="ScopeProfit inicio">
        <span className="brand-icon">s<span>p</span></span>Scope<span>Profit</span>
      </Link>
      <nav aria-label="Principal">
        <Link href="/login">Iniciar sesión</Link>
        <Link href="/login" className="nav-enter">Crear cuenta <span aria-hidden>↗</span></Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === '/' || pathname === '/faq' || pathname === '/status') return null;

  return (
    <footer className="site-footer">
      <span>ScopeProfit · Cobrá por lo que hacés. Cotizá lo que no.</span>
      <span>Tu criterio siempre tiene la última palabra.</span>
    </footer>
  );
}
