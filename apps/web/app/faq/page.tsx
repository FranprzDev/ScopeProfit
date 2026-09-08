'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Code2, 
  ArrowRight, 
  MessageSquare, 
  Cpu, 
  FileText, 
  ShieldCheck
} from 'lucide-react';
import s from '../landing.module.css';

interface FaqGroup {
  category: string;
  icon: React.ReactNode;
  items: { q: string; a: string }[];
}

const faqGroups: FaqGroup[] = [
  {
    category: 'Sobre el Cliente y Telegram',
    icon: <MessageSquare size={18} color="#38bdf8" />,
    items: [
      {
        q: '¿Mi cliente necesita instalar o registrarse en alguna plataforma?',
        a: 'No. Tu cliente solamente hace clic en el enlace de Telegram que le compartís y habla con el bot como si hablara con una persona. No requiere crear cuentas, recordar contraseñas ni descargar apps adicionales.'
      },
      {
        q: '¿Qué tipo de mensajes puede mandar el cliente?',
        a: 'Puede mandar audios de voz largos (de hasta varios minutos), fotos de pizarras o bocetos en papel, capturas de pantalla de sistemas que le gusten y textos sueltos o ideas desordenadas a cualquier hora.'
      },
      {
        q: '¿Qué pasa si el cliente cambia de idea a mitad de la conversación?',
        a: 'El agente actualiza el contexto del proyecto y detecta las contradicciones, repreguntando cuál es la decisión final para que el alcance refleje siempre la última versión acordada.'
      }
    ]
  },
  {
    category: 'Inteligencia Artificial y Costos (BYOK)',
    icon: <Cpu size={18} color="#ea2845" />,
    items: [
      {
        q: '¿Qué modelo de IA utiliza y cómo se cobran los tokens?',
        a: 'ScopeProfit opera con arquitectura BYOK (Bring Your Own Key). Cargás tu propia clave de Google Gemini en tus ajustes: consumís directamente de tu cuenta con el tier gratuito o costo oficial por token, con $0 markup de nuestra parte.'
      },
      {
        q: '¿Por qué usan arquitectura BYOK en vez de cobrar suscripción con IA incluida?',
        a: 'Porque no queremos inflar el precio con comisiones ocultas ni limitar artificialmente tus consultas. Vos pagás centavos de dólar directamente al proveedor de IA por lo que realmente consumís.'
      },
      {
        q: '¿El agente puede prometer cosas o enviar presupuestos por su cuenta?',
        a: 'Jamás. El agente actúa exclusivamente como un relevador técnico de requerimientos y riesgos. Todo documento o cotización pasa por tu panel y requiere tu confirmación explícita antes de llegar al cliente.'
      }
    ]
  },
  {
    category: 'El Documento y Cierre Comercial',
    icon: <FileText size={18} color="#34d399" />,
    items: [
      {
        q: '¿En qué formato se entregan las especificaciones?',
        a: 'Se compilan en dos formatos en simultáneo: un PDF formal de alta resolución con índice y secciones numeradas listo para anexar al contrato comercial, y un archivo Word (.docx) editable para personalizarlo con el membrete y estilos de tu agencia.'
      },
      {
        q: '¿Puedo editar manualmente cualquier sección antes de aprobarla?',
        a: 'Sí, contás con un editor visual en el panel web para modificar, agregar requerimientos o tachar cláusulas antes de generar el documento final.'
      },
      {
        q: '¿Cómo me protege la sección "No incluye" (Out of Scope)?',
        a: 'Al dejar asentado por escrito lo que queda excluido, cualquier pedido extra que el cliente solicite durante el desarrollo deja de ser un "favor gratis" y se convierte formalmente en una orden de cambio facturable.'
      }
    ]
  },
  {
    category: 'Seguridad y Privacidad',
    icon: <ShieldCheck size={18} color="#fbbf24" />,
    items: [
      {
        q: '¿Mis datos o los de mi cliente se usan para entrenar modelos públicos?',
        a: 'No. Las llamadas a las APIs empresariales de Google Gemini no se utilizan para reentrenar modelos públicos según los términos de privacidad de API de Google.'
      },
      {
        q: '¿Quién tiene acceso a los proyectos generados?',
        a: 'Únicamente vos desde tu cuenta autenticada y el cliente asignado a través de su enlace seguro y efímero de Telegram.'
      }
    ]
  }
];

export default function FaqPage() {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    'Sobre el Cliente y Telegram-0': true,
    'Inteligencia Artificial y Costos (BYOK)-0': true
  });

  const toggle = (key: string) => {
    setOpenMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

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

      {/* FAQ HERO HEADER */}
      <main className={s.pageHeaderSub}>
        <div className={s.badge}>
          <span className={s.sparkleMark}>✦</span>
          <span>CENTRO DE RESPUESTAS & CLARIDAD</span>
        </div>
        <h1 className={s.h1} style={{ fontSize: 'clamp(2.2rem, 4vw, 3.2rem)' }}>
          Preguntas Frecuentes
          <span className={s.h1Red}>Claridad antes de empezar.</span>
        </h1>
        <p className={s.lead} style={{ maxWidth: '620px', margin: '0 auto 3rem' }}>
          Todo lo que necesitás saber sobre cómo funciona ScopeProfit, la integración con Telegram, el modelo de IA y la protección contra el scope creep.
        </p>

        {/* CATEGORIZED FAQ LIST */}
        <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          {faqGroups.map((group, gIdx) => (
            <div key={gIdx}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
                <div style={{ 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '8px', 
                  background: 'rgba(255,255,255,0.05)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  {group.icon}
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 750, color: 'var(--text-white)', margin: 0 }}>
                  {group.category}
                </h2>
              </div>

              <div className={s.faqWrapper} style={{ maxWidth: '100%' }}>
                {group.items.map((item, iIdx) => {
                  const key = `${group.category}-${iIdx}`;
                  const isOpen = !!openMap[key];
                  return (
                    <div 
                      key={iIdx} 
                      className={`${s.faqItem} ${isOpen ? s.faqItemOpen : ''}`}
                      onClick={() => toggle(key)}
                    >
                      <div className={s.faqQuestion}>
                        <span>{item.q}</span>
                        <span className={s.faqIcon}>{isOpen ? '−' : '+'}</span>
                      </div>
                      {isOpen && (
                        <p className={s.faqAnswer}>{item.a}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* CALL TO ACTION */}
        <div style={{ 
          marginTop: '5rem', 
          background: 'var(--nest-dark-elevated)', 
          border: '1px solid var(--nest-card-border)', 
          borderRadius: '16px', 
          padding: '2.5rem 2rem',
          textAlign: 'center' 
        }}>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 750, color: 'var(--text-white)', margin: '0 0 0.5rem' }}>
            ¿Tenés alguna otra duda sobre tu caso de uso?
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: '0 0 1.5rem' }}>
            Podés crear tu cuenta gratis en menos de un minuto y probar el flujo con tu primer proyecto.
          </p>
          <Link href="/login" className={s.btnPrimary} style={{ display: 'inline-flex' }}>
            Comenzar gratis
            <ArrowRight size={16} />
          </Link>
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
            <Link href="/#flujo-exacto" className={s.footerCompactLink}>Paso a paso</Link>
            <Link href="/#anatomia-documento" className={s.footerCompactLink}>El Entregable</Link>
            <Link href="/status" className={s.footerCompactLink}>Estado</Link>
            <a href="https://github.com/FranprzDev/ScopeProfit" target="_blank" rel="noreferrer" className={s.footerCompactLink}>GitHub</a>
          </nav>

          <Link href="/status" className={s.footerStatusLink} title="Ver página de estado de servicios">
            <span className={s.statusDot} />
            <span>SISTEMAS OPERATIVOS · TELEGRAM OK</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        <div className={s.footerCompactBottom}>
          <span>&copy; {new Date().getFullYear()} ScopeProfit. Construido para desarrolladores freelance y agencias.</span>
          <div style={{ display: 'flex', gap: '1.25rem' }}>
            <Link href="/faq" style={{ color: 'inherit', textDecoration: 'none' }}>Ayuda & SLA</Link>
            <Link href="/status" style={{ color: 'inherit', textDecoration: 'none' }}>Estado de Servidores</Link>
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Volver al inicio ↑</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
