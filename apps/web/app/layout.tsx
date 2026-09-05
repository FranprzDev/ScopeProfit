import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = { title: { default: 'ScopeProfit — Del pedido al alcance claro', template: '%s · ScopeProfit' }, description: 'Transformá conversaciones con clientes en requerimientos, riesgos y un alcance claro. Revisá y entregá tu propuesta en PDF y Word.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><header className="site-header"><Link className="brand" href="/" aria-label="ScopeProfit inicio"><span className="brand-icon">s<span>p</span></span>Scope<span>Profit</span></Link><nav aria-label="Principal"><Link href="/checklist">Checklist gratuita</Link><Link href="/dashboard" className="nav-enter">Mi espacio <span aria-hidden>↗</span></Link></nav></header>{children}<footer className="site-footer"><span>ScopeProfit · Menos ambigüedad. Mejores proyectos.</span><span>Tu criterio siempre tiene la última palabra.</span></footer></body></html>;
}
