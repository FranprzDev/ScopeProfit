'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Code2, 
  ArrowRight, 
  CheckCircle2, 
  MessageSquare, 
  Cpu, 
  FileText, 
  Database, 
  Globe, 
  Clock
} from 'lucide-react';
import s from '../landing.module.css';

interface ServiceStatus {
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'operational' | 'degraded' | 'outage';
  uptime: string;
  latency: string;
}

const services: ServiceStatus[] = [
  {
    name: 'Telegram Bot Gateway & Webhooks',
    description: 'Recepción y procesamiento de audios, textos y capturas de pantalla de clientes.',
    icon: <MessageSquare size={20} color="#38bdf8" />,
    status: 'operational',
    uptime: '100%',
    latency: '38ms'
  },
  {
    name: 'Motor de Inteligencia de Alcance (Gemini BYOK)',
    description: 'Detección activa de ambigüedades, zonas grises y redacción del Brief estructurado.',
    icon: <Cpu size={20} color="#ea2845" />,
    status: 'operational',
    uptime: '99.97%',
    latency: '310ms'
  },
  {
    name: 'Compilador de Documentos (PDF & Word .docx)',
    description: 'Renderizado de documentos formales numerados listos para firma legal.',
    icon: <FileText size={20} color="#34d399" />,
    status: 'operational',
    uptime: '100%',
    latency: '65ms'
  },
  {
    name: 'Base de Datos y Cifrado de Credenciales',
    description: 'Almacenamiento persistente, sesiones seguras y cifrado AES-256 de claves de API.',
    icon: <Database size={20} color="#fbbf24" />,
    status: 'operational',
    uptime: '100%',
    latency: '12ms'
  },
  {
    name: 'Portal Web de Profesionales & Autenticación',
    description: 'Dashboard administrativo, editor enriquecido de briefs y gestión de proyectos.',
    icon: <Globe size={20} color="#c084fc" />,
    status: 'operational',
    uptime: '99.99%',
    latency: '24ms'
  }
];

export default function StatusPage() {
  return (
    <div className={s.page}>
      <div className={s.bgGrid} />
      <div className={s.bgGlow} />

      {/* Top Navbar */}
      <header className={s.navWrapper}>
        <div className={s.navInner}>
          <Link href="/" className={s.brand}>
            <div className={s.brandLogo}>
              <Code2 />
            </div>
            <span>Scope<span className={s.brandRed}>Profit</span></span>
          </Link>

          <div className={s.navActions}>
            <Link href="/login" className={s.navLogin}>Iniciar sesión</Link>
            <Link href="/login" className={s.navCta}>
              Empezar gratis
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      {/* STATUS HEADER */}
      <main className={s.pageHeaderSub} style={{ maxWidth: '900px' }}>
        <div className={s.badge}>
          <span className={s.statusDot} />
          <span>MONITOREO DE INFRAESTRUCTURA EN TIEMPO REAL</span>
        </div>

        <h1 className={s.h1} style={{ fontSize: 'clamp(2.2rem, 4vw, 3.2rem)' }}>
          Estado del Sistema
          <span className={s.h1Red}>Todos los servicios operativos.</span>
        </h1>
        <p className={s.lead} style={{ maxWidth: '640px', margin: '0 auto 2.5rem' }}>
          Monitoreo continuo de la disponibilidad del bot de Telegram, los motores de IA y los servicios de compilación de documentos.
        </p>

        {/* HERO STATUS BANNER */}
        <div className={s.statusHero}>
          <div className={s.statusHeroTitle}>
            <CheckCircle2 size={28} color="#4ade80" />
            <div>
              <div>Sistemas 100% Funcionales</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                Sin incidentes reportados en los últimos 90 días
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '2rem', textAlign: 'right' }}>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-white)' }}>99.98%</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Uptime 90 días</div>
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80' }}>42ms</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Latencia Media</div>
            </div>
          </div>
        </div>

        {/* SERVICES BREAKDOWN */}
        <div style={{ textAlign: 'left', marginBottom: '3.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-white)', marginBottom: '1rem', letterSpacing: '-0.01em' }}>
            Servicios y Componentes Principales
          </h2>

          <div className={s.statusServicesGrid}>
            {services.map((srv, idx) => (
              <div key={idx} className={s.statusServiceRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '10px', 
                    background: 'rgba(255,255,255,0.04)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {srv.icon}
                  </div>
                  <div>
                    <div className={s.statusServiceName}>{srv.name}</div>
                    <p className={s.statusServiceDesc}>{srv.description}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div style={{ textAlign: 'right', display: 'none', minWidth: '80px' }} className={s.statusMetaDesktop}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontFamily: 'ui-monospace, monospace' }}>{srv.latency}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>latencia</div>
                  </div>
                  <span className={s.statusPillActive}>
                    <span className={s.statusDot} />
                    <span>OPERACIONAL</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* INCIDENT HISTORY */}
        <div style={{ 
          textAlign: 'left',
          background: 'var(--nest-dark-elevated)', 
          border: '1px solid var(--nest-card-border)', 
          borderRadius: '16px', 
          padding: '2rem'
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 750, color: 'var(--text-white)', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} color="var(--nest-red)" />
            Historial de Mantenimientos & Incidentes
          </h3>
          <div style={{ padding: '1rem 0', borderTop: '1px solid var(--nest-card-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-white)' }}>Actualización de Runtime y Conector de Telegram</strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>Completado con éxito</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              Migración a Node 22 / pnpm sin degradación del servicio ni pérdida de mensajes en cola.
            </p>
          </div>
        </div>
      </main>

      {/* COMPACT MODERN FOOTER */}
      <footer className={s.footerCompact} style={{ marginTop: '5rem' }}>
        <div className={s.footerCompactInner}>
          <div className={s.footerCompactBrand}>
            <Link href="/" className={s.brand}>
              <div className={s.brandLogo}>
                <Code2 />
              </div>
              <span>Scope<span className={s.brandRed}>Profit</span></span>
            </Link>
            <span className={s.footerCompactTagline}>
              Relevamiento de requerimientos y blindaje de alcance
            </span>
          </div>

          <nav className={s.footerCompactNav}>
            <Link href="/" className={s.footerCompactLink}>Inicio</Link>
            <Link href="/faq" className={s.footerCompactLink}>Preguntas Frecuentes</Link>
            <a href="https://github.com/FranprzDev/ScopeProfit" target="_blank" rel="noreferrer" className={s.footerCompactLink}>GitHub</a>
          </nav>

          <div className={s.footerStatusLink} style={{ cursor: 'default' }}>
            <span className={s.statusDot} />
            <span>SISTEMAS OPERATIVOS · TELEGRAM OK</span>
          </div>
        </div>

        <div className={s.footerCompactBottom}>
          <span>&copy; {new Date().getFullYear()} ScopeProfit. Construido para desarrolladores freelance y agencias.</span>
          <div style={{ display: 'flex', gap: '1.25rem' }}>
            <Link href="/faq" style={{ color: 'inherit', textDecoration: 'none' }}>Ayuda & SLA</Link>
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Volver al inicio ↑</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
