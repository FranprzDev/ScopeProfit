'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { 
  ArrowRight, 
  CheckCircle2, 
  FileText, 
  Terminal, 
  Cpu, 
  Lock, 
  MessageSquare, 
  ShieldCheck, 
  Code2,
  FileSpreadsheet,
  HelpCircle,
  FileCheck,
  MessageSquareQuote,
  ShieldAlert,
  BadgeCheck,
  AlertTriangle,
  Timer,
  UserCheck,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Minus
} from 'lucide-react';
import s from './landing.module.css';

const brandSprites = [
  { char: '✦', colorClass: s.spriteRed, top: '5%', left: '4%', size: '1.2rem' },
  { char: '◆', colorClass: s.spriteAmber, top: '15%', right: '5%', size: '0.9rem' },
  { char: '✦', colorClass: s.spriteCyan, top: '28%', left: '3%', size: '1.1rem' },
  { char: '✕', colorClass: s.spriteEmerald, top: '42%', right: '4%', size: '0.85rem' },
  { char: '✦', colorClass: s.spritePurple, top: '58%', left: '5%', size: '1rem' },
  { char: '◆', colorClass: s.spriteRed, top: '74%', right: '6%', size: '1.1rem' },
  { char: '✦', colorClass: s.spriteAmber, top: '88%', left: '4%', size: '0.9rem' },
];

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const workbenchRef = useRef<HTMLDivElement>(null);
  
  // Interactive Studio Timeline State
  type StudioStep = 'link' | 'audio' | 'ai' | 'review' | 'contract';
  const [studioStep, setStudioStep] = useState<StudioStep>('link');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(14);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [estimatedHours, setEstimatedHours] = useState(24);
  const [isApproved, setIsApproved] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  // Audio simulation timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlayingAudio) {
      interval = setInterval(() => {
        setAudioSeconds(prev => {
          if (prev >= 42) {
            setIsPlayingAudio(false);
            return 42;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlayingAudio]);

  const switchStudioStep = (step: StudioStep) => {
    setStudioStep(step);
    if (step !== 'audio') {
      setIsPlayingAudio(false);
    }
    gsap.fromTo(
      `.${s.workbenchBody}`,
      { opacity: 0.4, y: 8 },
      { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }
    );
  };

  const handleCopyWhatsapp = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText('Hola Juan! Para cotizar tu app sin idas y vueltas, contale tu idea a nuestro bot de Telegram: mandale audios o capturas acá https://t.me/ScopeProfitBot?start=tok_b2b_9918a').catch(() => {});
    }
    setCopiedWhatsapp(true);
    setTimeout(() => setCopiedWhatsapp(false), 2500);
  };

  const handleApproveScope = () => {
    setIsApproved(true);
    setTimeout(() => {
      switchStudioStep('contract');
      setIsApproved(false);
    }, 600);
  };

  const handleDownload = (type: 'pdf' | 'docx') => {
    const name = type === 'pdf' ? 'Alcance_Blindado_ScopeProfit.pdf' : 'Alcance_Editable_ScopeProfit.docx';
    setDownloadToast(`✓ Generando y descargando ${name}...`);
    setTimeout(() => setDownloadToast(null), 3000);
  };

  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText('https://t.me/ScopeProfitBot?start=tok_b2b_9918a').catch(() => {});
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // GSAP Initial Mount Animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Glow breathing animation
      if (glowRef.current) {
        gsap.to(glowRef.current, {
          scale: 1.15,
          opacity: 0.85,
          duration: 4,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      }

      // Brand floating sprites animation
      gsap.to(`.${s.sprite}`, {
        y: '-=16',
        rotation: 25,
        duration: 3.5,
        stagger: {
          each: 0.25,
          repeat: -1,
          yoyo: true,
        },
        ease: 'sine.inOut',
      });

      // Hero Elements Staggered Entrance
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.from(`.${s.badge}`, {
        y: -20,
        opacity: 0,
        duration: 0.6,
      })
      .from(`.${s.h1}`, {
        y: 30,
        opacity: 0,
        duration: 0.8,
      }, '-=0.3')
      .from(`.${s.lead}`, {
        y: 20,
        opacity: 0,
        duration: 0.6,
      }, '-=0.4')
      .from(`.${s.ctaRow} > *`, {
        y: 20,
        opacity: 0,
        stagger: 0.15,
        duration: 0.6,
      }, '-=0.3')
      .from(`.${s.explainerBox}`, {
        y: 25,
        opacity: 0,
        duration: 0.7,
      }, '-=0.2')
      .from(`.${s.metricsBar} .${s.metricItem}`, {
        y: 20,
        opacity: 0,
        stagger: 0.1,
        duration: 0.6,
      }, '-=0.2')
      .from(workbenchRef.current, {
        y: 25,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
      }, 0.2);

    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className={s.page} ref={heroRef}>
      {/* Dynamic Backgrounds */}
      <div className={s.bgGrid} />
      <div className={s.bgGlow} ref={glowRef} />

      {/* Brand Ambient Sprites */}
      <div className={s.spriteContainer} aria-hidden="true">
        {brandSprites.map((sp, idx) => (
          <span 
            key={idx}
            className={`${s.sprite} ${sp.colorClass}`}
            style={{ 
              top: sp.top, 
              left: sp.left, 
              right: sp.right, 
              fontSize: sp.size 
            }}
          >
            {sp.char}
          </span>
        ))}
      </div>

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

      {/* HERO SECTION */}
      <section className={s.hero}>
        <div className={s.heroContent}>
          <div className={s.badge}>
            <span className={s.sparkleMark}>✦</span>
            <span>RELEVAMIENTO DE REQUERIMIENTOS POR TELEGRAM PARA FREELANCERS & AGENCIAS</span>
          </div>

          <h1 className={s.h1}>
            No scopear es perder dinero.
            <span className={s.h1Red}>Cerrá el alcance antes de cotizar.</span>
          </h1>

          <p className={s.lead}>
            Convertí audios, capturas y charlas sueltas de tus clientes en una
            <strong> especificación técnica blindada</strong> — con lo que incluye, lo que NO incluye y
            zonas grises identificadas antes de escribir una sola línea de código.
          </p>

          <div className={s.ctaRow}>
            <Link href="/login" className={s.btnPrimary}>
              Crear mi cuenta gratis
              <ArrowRight size={18} />
            </Link>
            <a href="#flujo-exacto" className={s.btnSecondary}>
              <Terminal size={18} />
              Ver cómo funciona exactamente
            </a>
          </div>

          {/* EXPLAINER CALLOUT: ¿QUÉ HACE EXACTAMENTE? */}
          <div id="que-hace" className={s.explainerBox}>
            <div className={s.explainerIcon}>
              <FileCheck size={24} />
            </div>
            <div className={s.explainerText}>
              <h3>En 30 segundos: ¿Qué hace ScopeProfit exactamente?</h3>
              <p>
                Le compartís a tu cliente un enlace a un bot de <strong>Telegram</strong>. Tu cliente manda audios, capturas y textos contando su idea. Un agente de IA especializado le repregunta los <strong>puntos ciegos y zonas grises</strong> que vos no tenés tiempo de indagar, y genera un <strong>documento formal (con lo que incluye, lo que NO incluye, riesgos y horas)</strong> en PDF y Word editable para que firme antes de programar.
              </p>
            </div>
          </div>

          {/* Metrics bar */}
          <div className={s.metricsBar}>
            <div className={s.metricItem}>
              <span className={s.metricVal}>0<em>%</em></span>
              <span className={s.metricLabel}>Scope Creep no facturado</span>
            </div>
            <div className={s.metricItem}>
              <span className={s.metricVal}>12<em>m</em></span>
              <span className={s.metricLabel}>Tiempo promedio de briefing</span>
            </div>
            <div className={s.metricItem}>
              <span className={s.metricVal}>$0</span>
              <span className={s.metricLabel}>Markup en IA (BYOK Gemini)</span>
            </div>
            <div className={s.metricItem}>
              <span className={s.metricVal}>100<em>%</em></span>
              <span className={s.metricLabel}>Aprobación humana previa</span>
            </div>
          </div>
        </div>

        {/* INTERACTIVE WORKBENCH SHOWCASE */}
        <div id="workbench" className={s.workbench} ref={workbenchRef}>
          <div className={s.workbenchHeader}>
            <div className={s.workbenchDots}>
              <span className={s.dotRed} />
              <span className={s.dotYellow} />
              <span className={s.dotGreen} />
            </div>
            <span className={s.workbenchPath}>scopeprofit-runtime · simulador de proyecto en vivo</span>
            <div className={s.workbenchStatus}>
              <span className={s.workbenchStatusDot} />
              <span>SISTEMA ACTIVO</span>
            </div>
          </div>

          <div className={s.workbenchTabs}>
            <button 
              className={`${s.workbenchTab} ${studioStep === 'link' ? s.workbenchTabActive : ''}`}
              onClick={() => switchStudioStep('link')}
            >
              <span className={s.workbenchTabNum}>01</span>
              <span>Invitación & Link</span>
            </button>
            <button 
              className={`${s.workbenchTab} ${studioStep === 'audio' ? s.workbenchTabActive : ''}`}
              onClick={() => switchStudioStep('audio')}
            >
              <span className={s.workbenchTabNum}>02</span>
              <span>Audio Telegram</span>
            </button>
            <button 
              className={`${s.workbenchTab} ${studioStep === 'ai' ? s.workbenchTabActive : ''}`}
              onClick={() => switchStudioStep('ai')}
            >
              <span className={s.workbenchTabNum}>03</span>
              <span>Radar IA</span>
            </button>
            <button 
              className={`${s.workbenchTab} ${studioStep === 'review' ? s.workbenchTabActive : ''}`}
              onClick={() => switchStudioStep('review')}
            >
              <span className={s.workbenchTabNum}>04</span>
              <span>Tu Aprobación</span>
            </button>
            <button 
              className={`${s.workbenchTab} ${studioStep === 'contract' ? s.workbenchTabActive : ''}`}
              onClick={() => switchStudioStep('contract')}
            >
              <span className={s.workbenchTabNum}>05</span>
              <span>Contrato Final</span>
            </button>
          </div>

          <div className={s.workbenchBody}>
            {/* HITO 1: INVITACION Y LINK */}
            {studioStep === 'link' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={s.workbenchActorPill} style={{ background: 'rgba(234, 40, 69, 0.15)', color: '#ea2845', border: '1px solid rgba(234, 40, 69, 0.3)' }}>
                      💻 Vos (El Desarrollador o Agencia)
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Hito 01 · Crear proyecto</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>
                    TOKEN: tok_b2b_9918a // EXCLUSIVO
                  </span>
                </div>

                <div>
                  <h3 style={{ fontSize: '1.15rem', color: 'var(--text-white)', margin: '0 0 0.4rem', fontWeight: 700 }}>
                    Creás el proyecto en 10 segundos y compartís el enlace seguro
                  </h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    Tu cliente no tiene que crearse una cuenta ni aprender herramientas nuevas. Vos le enviás un link privado de Telegram con un mensaje prediseñado para WhatsApp o Slack.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  {/* Token & Direct Link Box */}
                  <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--nest-card-border)', borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontFamily: 'ui-monospace, monospace', color: 'var(--text-dim)', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                        ENLACE PRIVADO DEL PROYECTO
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.65rem 0.85rem', fontSize: '0.82rem', color: '#38bdf8', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.75rem' }}>
                        t.me/ScopeProfitBot?start=tok_b2b_9918a
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={handleCopyLink}
                      style={{
                        background: copiedLink ? 'rgba(52, 211, 153, 0.15)' : 'rgba(56, 189, 248, 0.12)',
                        border: copiedLink ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(56, 189, 248, 0.3)',
                        color: copiedLink ? '#34d399' : '#38bdf8',
                        padding: '0.5rem 0.85rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {copiedLink ? '✓ Enlace copiado' : 'Copiar solo enlace'}
                    </button>
                  </div>

                  {/* WhatsApp Message Preview Box */}
                  <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--nest-card-border)', borderRadius: '10px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.72rem', fontFamily: 'ui-monospace, monospace', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                          PLANTILLA PARA WHATSAPP
                        </span>
                        <span style={{ fontSize: '0.7rem', background: 'rgba(37, 211, 102, 0.12)', color: '#25d366', border: '1px solid rgba(37, 211, 102, 0.25)', borderRadius: '4px', padding: '0.1rem 0.4rem', fontWeight: 700 }}>
                          WhatsApp Ready
                        </span>
                      </div>
                      <div style={{ background: 'rgba(37, 211, 102, 0.04)', border: '1px solid rgba(37, 211, 102, 0.2)', padding: '0.75rem 0.85rem', borderRadius: '8px', fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.5, fontStyle: 'italic', marginBottom: '0.75rem' }}>
                        &quot;Hola Juan! Para cotizarte la app sin reuniones eternas, contale tu idea a nuestro bot de Telegram: mandale audios o capturas acá: <span style={{ color: '#38bdf8' }}>t.me/ScopeProfitBot...</span>&quot;
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={handleCopyWhatsapp}
                      style={{
                        background: copiedWhatsapp ? 'rgba(52, 211, 153, 0.2)' : 'rgba(234, 40, 69, 0.15)',
                        border: copiedWhatsapp ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(234, 40, 69, 0.3)',
                        color: copiedWhatsapp ? '#34d399' : '#ea2845',
                        padding: '0.5rem 0.85rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {copiedWhatsapp ? '✓ Mensaje copiado' : 'Copiar mensaje completo'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button 
                    type="button" 
                    onClick={() => switchStudioStep('audio')}
                    className={`${s.workbenchNavBtn} ${s.workbenchNavBtnPrimary}`}
                  >
                    Paso 02: Ver lo que hace el cliente en Telegram
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* HITO 2: CHAT Y AUDIO TELEGRAM */}
            {studioStep === 'audio' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={s.workbenchActorPill} style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                      👤 Tu Cliente (En Telegram)
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Hito 02 · Cero fricción (0 logins requeridos)</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#4ade80', fontFamily: 'ui-monospace, monospace' }}>
                    ● CANAL ACTIVO: TELEGRAM BOT
                  </span>
                </div>

                <div className={s.chatSimulation}>
                  <div className={`${s.chatMsg} ${s.chatMsgUser}`}>
                    <div className={`${s.chatAvatar} ${s.avatarClient}`}>CL</div>
                    <div style={{ flex: 1 }}>
                      <div className={s.chatBubble}>
                        <div style={{ marginBottom: '0.5rem' }}>
                          Hola! Necesitamos armar una app rápida para nuestros distribuidores. Básicamente que puedan ver el catálogo, hacer pedidos en cuenta corriente y tener un panel de métricas estándar.
                        </div>
                        
                        {/* Reproductor interactivo de audio */}
                        <div className={s.chatVoice}>
                          <button 
                            type="button" 
                            className={s.audioPlayBtn} 
                            onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                            title={isPlayingAudio ? "Pausar audio" : "Reproducir audio"}
                          >
                            {isPlayingAudio ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: '2px' }} />}
                          </button>

                          <div className={s.voiceWave}>
                            {[12, 18, 8, 22, 14, 24, 10, 16, 20, 12, 18, 9, 21, 15, 23, 11].map((h, i) => (
                              <span 
                                key={i} 
                                className={`${s.waveBar} ${isPlayingAudio ? s.waveBarPlaying : ''}`} 
                                style={{ 
                                  height: `${h}px`,
                                  animationDelay: `${(i % 5) * 0.15}s`
                                }} 
                              />
                            ))}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem', color: isPlayingAudio ? '#ea2845' : 'var(--text-muted)' }}>
                            <span>0:{audioSeconds < 10 ? `0${audioSeconds}` : audioSeconds}</span>
                            <span>/</span>
                            <span>0:42</span>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
                          {isPlayingAudio ? '▶ Reproduciendo audio del cliente...' : 'Clic en Play para simular la reproducción del audio'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={s.chatMsg} style={{ alignSelf: 'flex-end', flexDirection: 'row-reverse' }}>
                    <div className={`${s.chatAvatar} ${s.avatarBot}`}>SP</div>
                    <div className={s.chatBubble} style={{ borderTopRightRadius: '2px', background: 'rgba(234, 40, 69, 0.08)', borderColor: 'rgba(234, 40, 69, 0.25)' }}>
                      ¡Anotado! Para proteger la cotización y los plazos, necesitamos definir tres puntos críticos:
                      <br /><strong>1.</strong> ¿Los distribuidores pagan en la app (Stripe/MercadoPago) o con cuenta corriente previa?
                      <br /><strong>2.</strong> ¿Quién realiza la carga inicial de los productos y listas de precios?
                      <br /><strong>3.</strong> ¿El stock debe sincronizarse en tiempo real con su ERP actual o mediante planillas?
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button 
                    type="button" 
                    onClick={() => switchStudioStep('ai')}
                    className={`${s.workbenchNavBtn} ${s.workbenchNavBtnPrimary}`}
                  >
                    Paso 03: Ver cómo el motor IA detecta zonas grises
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* HITO 3: RADAR DE ZONAS GRISES */}
            {studioStep === 'ai' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={s.workbenchActorPill} style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                      ⚡ Motor de Inteligencia (Gemini BYOK)
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Hito 03 · Detección de riesgos antes de cotizar</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#fbbf24', fontFamily: 'ui-monospace, monospace' }}>
                    3 ALERTAS DETECTADAS
                  </span>
                </div>

                <div className={s.engineSimulation}>
                  <div className={s.engineRow}>
                    <span className={`${s.engineBadge} ${s.badgeAmbiguity}`}>AMBIGÜEDAD [ALTA]</span>
                    <div className={s.engineDetails}>
                      <h4>&quot;Panel de métricas estándar&quot;</h4>
                      <p>Detectada falta de granularidad. Sin métricas explícitas definidas, el cliente suele asumir exportación automática en PDF/Excel y gráficos en tiempo real no cotizados.</p>
                    </div>
                  </div>
                  <div className={s.engineRow}>
                    <span className={`${s.engineBadge} ${s.badgeRisk}`}>ZONA GRIS CONTRACTUAL</span>
                    <div className={s.engineDetails}>
                      <h4>Sincronización con ERP externo</h4>
                      <p>Si el cliente no provee API documentada o credenciales en fecha acordada, el desarrollo se detiene. Se genera cláusula de mitigación y dependencia externa.</p>
                    </div>
                  </div>
                  <div className={s.engineRow}>
                    <span className={`${s.engineBadge} ${s.badgeRequirement}`}>REQUERIMIENTO ESTRUCTURADO</span>
                    <div className={s.engineDetails}>
                      <h4>Módulo de Pedidos con Aprobación en 2 Pasos</h4>
                      <p>Criterios de aceptación estipulados: Roles &apos;Distribuidor&apos; y &apos;Administrador&apos;. Notificaciones por email incluidas, integración WhatsApp como opcional cotizable.</p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button 
                    type="button" 
                    onClick={() => switchStudioStep('review')}
                    className={`${s.workbenchNavBtn} ${s.workbenchNavBtnPrimary}`}
                  >
                    Paso 04: Ver tu panel de revisión (Human-in-the-loop)
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* HITO 4: REVISION DEL DEV (HUMAN-IN-THE-LOOP) */}
            {studioStep === 'review' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={s.workbenchActorPill} style={{ background: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.3)' }}>
                      💻 Vos (En tu Panel Web)
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Hito 04 · Human-in-the-loop estricto</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#c084fc', fontFamily: 'ui-monospace, monospace' }}>
                    APROBACIÓN MANUAL REQUERIDA
                  </span>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--nest-card-border)', borderRadius: '12px', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--nest-card-border)', paddingBottom: '1rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#c084fc', fontFamily: 'ui-monospace, monospace' }}>BORRADOR GENERADO // LISTO PARA TU REVISIÓN</span>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-white)' }}>Portal B2B de Distribuidores</div>
                    </div>
                    
                    {/* Ajustador de horas interactivo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Horas estimadas:</span>
                      <div className={s.hoursAdjuster}>
                        <button 
                          type="button" 
                          className={s.hoursBtn} 
                          onClick={() => setEstimatedHours(h => Math.max(8, h - 2))}
                          title="Restar horas"
                        >
                          <Minus size={12} />
                        </button>
                        <span className={s.hoursVal}>{estimatedHours} hrs</span>
                        <button 
                          type="button" 
                          className={s.hoursBtn} 
                          onClick={() => setEstimatedHours(h => h + 2)}
                          title="Sumar horas"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 700, marginBottom: '0.4rem' }}>✓ MÓDULOS VALIDADOS</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        • Catálogo y precios mayoristas<br />
                        • Pedidos en cuenta corriente<br />
                        • Roles Admin y Distribuidor
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#ea2845', fontWeight: 700, marginBottom: '0.4rem' }}>✕ EXCLUSIONES FORMALES</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        • Pasarela de cobros online<br />
                        • Carga masiva de inventario<br />
                        • App móvil iOS nativa
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      La IA jamás envía nada al cliente sin tu visto bueno previo.
                    </span>
                    <button 
                      type="button" 
                      onClick={handleApproveScope}
                      style={{
                        background: isApproved ? '#22c55e' : 'var(--nest-red)',
                        color: '#fff',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s ease',
                        boxShadow: isApproved ? '0 0 20px rgba(34, 197, 94, 0.4)' : '0 0 20px var(--nest-red-glow)'
                      }}
                    >
                      {isApproved ? '✓ ¡Alcance Aprobado!' : '✓ Aprobar y Generar Contrato'}
                      {!isApproved && <ArrowRight size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* HITO 5: ALCANCE BLINDADO (ENTREGABLE FINAL) */}
            {studioStep === 'contract' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={s.workbenchActorPill} style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                      🔒 Entregable Final Blindado
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Hito 05 · Listo para firma y cierre</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#34d399', fontFamily: 'ui-monospace, monospace' }}>
                    HASH: SHA256-9b8a7c2d // IMMUTABLE
                  </span>
                </div>

                {downloadToast && (
                  <div style={{ background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)', color: '#34d399', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} />
                    <span>{downloadToast}</span>
                  </div>
                )}

                <div className={s.specSimulation}>
                  <div className={s.specHeader}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--nest-red)', fontFamily: 'ui-monospace, monospace' }}>SPEC_ID: PRJ-84920 // STATUS: READY_TO_SIGN</span>
                      <div className={s.specTitle}>Alcance de Proyecto — Portal B2B ({estimatedHours} Horas Acordadas)</div>
                    </div>
                    <span className={s.specVerifiedBadge}>
                      <CheckCircle2 size={14} />
                      Aprobado por Vos
                    </span>
                  </div>

                  <div className={s.specGrid}>
                    <div className={s.specCard}>
                      <h5>INCLUYE (IN-SCOPE)</h5>
                      <ul>
                        <li>Autenticación por Magic Link para distribuidores y admin</li>
                        <li>Catálogo con filtro por categorías y lista de precios personalizada</li>
                        <li>Carrito de compras con confirmación y envío por correo electrónico</li>
                        <li>Panel de control con historial de pedidos de los últimos 12 meses</li>
                      </ul>
                    </div>

                    <div className={s.specCard}>
                      <h5 style={{ color: '#ff5f56' }}>NO INCLUYE (OUT-OF-SCOPE)</h5>
                      <ul>
                        <li>Pasarela de cobro online con tarjeta (se acuerda factura fuera de sistema)</li>
                        <li>Carga manual masiva de más de 500 productos por el equipo dev</li>
                        <li>Integración con WebSockets o soporte offline</li>
                        <li>Cualquier módulo no listado en el anexo de requerimientos v1.0</li>
                      </ul>
                    </div>
                  </div>

                  <div className={s.specFooter}>
                    <span>Firmable legalmente · Criterios de Aceptación por módulo</span>
                    <div className={s.specDownloads}>
                      <button 
                        type="button" 
                        onClick={() => handleDownload('pdf')}
                        className={s.specBtn}
                        style={{ cursor: 'pointer', background: 'rgba(234, 40, 69, 0.1)', border: '1px solid rgba(234, 40, 69, 0.3)' }}
                      >
                        <FileText size={14} color="#ea2845" />
                        Descargar PDF Formal
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleDownload('docx')}
                        className={s.specBtn}
                        style={{ cursor: 'pointer', background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)' }}
                      >
                        <FileSpreadsheet size={14} color="#34d399" />
                        Descargar Word (.docx)
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button 
                    type="button" 
                    onClick={() => switchStudioStep('link')}
                    className={s.workbenchNavBtn}
                  >
                    <RotateCcw size={14} />
                    Reiniciar Simulación desde el Paso 01
                  </button>

                  <Link 
                    href="/login"
                    className={`${s.workbenchNavBtn} ${s.workbenchNavBtnPrimary}`}
                  >
                    Probar con tu propio proyecto
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* WORKBENCH TIMELINE FOOTER NAVIGATION */}
          <div className={s.workbenchFooterNav}>
            <button 
              type="button" 
              onClick={() => {
                const order: StudioStep[] = ['link', 'audio', 'ai', 'review', 'contract'];
                const idx = order.indexOf(studioStep);
                if (idx > 0) switchStudioStep(order[idx - 1]);
              }} 
              disabled={studioStep === 'link'}
              className={s.workbenchNavBtn}
            >
              ← Paso Anterior
            </button>

            <div className={s.workbenchStepIndicator}>
              {(['link', 'audio', 'ai', 'review', 'contract'] as StudioStep[]).map((st) => (
                <span 
                  key={st} 
                  onClick={() => switchStudioStep(st)}
                  className={`${s.workbenchStepDot} ${st === studioStep ? s.workbenchStepDotActive : ''}`}
                  style={{ cursor: 'pointer' }}
                />
              ))}
              <span style={{ marginLeft: '0.5rem' }}>
                Hito {studioStep === 'link' ? '01' : studioStep === 'audio' ? '02' : studioStep === 'ai' ? '03' : studioStep === 'review' ? '04' : '05'} de 05
              </span>
            </div>

            <button 
              type="button" 
              onClick={() => {
                const order: StudioStep[] = ['link', 'audio', 'ai', 'review', 'contract'];
                const idx = order.indexOf(studioStep);
                if (idx < order.length - 1) switchStudioStep(order[idx + 1]);
              }} 
              disabled={studioStep === 'contract'}
              className={s.workbenchNavBtn}
            >
              Siguiente Paso →
            </button>
          </div>
        </div>
      </section>

      {/* TIMELINE VISUAL DE PROYECTO (PASO A PASO REAL) */}
      <section id="flujo-exacto" className={s.section}>
        <div className={s.sectionHeader}>
          <span className={s.kicker}>
            <span className={s.sparkleMark}>✦</span>
            TIMELINE DE UN PROYECTO REAL
          </span>
          <h2 className={s.h2}>De la primera charla al contrato firmado</h2>
          <p className={s.sectionSubtitle}>
            Así interactuás vos, tu cliente y ScopeProfit desde el día cero hasta que cobrás tu presupuesto:
          </p>
        </div>

        <div className={s.timelineWrapper}>
          <div className={s.timelineSpine} aria-hidden="true" />

          {/* HITO 1 */}
          <div className={s.timelineItem}>
            <div className={s.timelineMarker}>
              <Terminal size={22} color="#ea2845" />
            </div>
            <div className={s.timelineCard}>
              <span className={s.cardCornerGlint} style={{ color: '#ea2845' }}>✦</span>
              <div className={s.timelineCardHeader}>
                <span className={`${s.timelineActorBadge} ${s.actorDev}`}>
                  💻 Vos (El Profesional o Agencia)
                </span>
                <span className={s.timelineStepTime}>Paso 01 · 30 segundos</span>
              </div>
              <h3 className={s.timelineTitle}>Creás el proyecto y obtenés el link para tu cliente</h3>
              <p className={s.timelineDesc}>
                Entrás a tu panel y creás el proyecto (o simplemente mandás <code>/createproject NombreCliente</code> a nuestro bot de Telegram). ScopeProfit te entrega un enlace de invitación privado y exclusivo para ese cliente.
              </p>

              <div className={s.timelineMockBox}>
                <div className={s.timelineMockHeader}>
                  <span>INVITACIÓN GENERADA // LISTA PARA ENVIAR</span>
                  <span>CANAL: TELEGRAM</span>
                </div>
                <div className={s.timelineMockCopyRow}>
                  <span className={s.timelineMockLink}>t.me/ScopeProfitBot?start=tok_b2b_9918a</span>
                  <button 
                    type="button"
                    onClick={handleCopyLink}
                    className={s.timelineMockTag}
                    style={{ 
                      cursor: 'pointer', 
                      background: copiedLink ? 'rgba(52, 211, 153, 0.2)' : 'rgba(234, 40, 69, 0.2)',
                      color: copiedLink ? '#34d399' : 'var(--nest-red)',
                      border: copiedLink ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(234, 40, 69, 0.4)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {copiedLink ? '✓ ¡Copiado!' : 'Copiar enlace'}
                  </button>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.45, fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.45rem' }}>
                  &quot;Hola Juan! Para armarte la propuesta exacta y no perder tiempo en reuniones repetidas, contale tu idea a nuestro bot de Telegram: mandale audios, capturas o textos con lo que tengas en mente.&quot;
                </div>
              </div>
            </div>
          </div>

          {/* HITO 2 */}
          <div className={s.timelineItem}>
            <div className={s.timelineMarker}>
              <MessageSquare size={22} color="#38bdf8" />
            </div>
            <div className={s.timelineCard}>
              <span className={s.cardCornerGlint} style={{ color: '#38bdf8' }}>✦</span>
              <div className={s.timelineCardHeader}>
                <span className={`${s.timelineActorBadge} ${s.actorClient}`}>
                  👤 Tu Cliente (En Telegram)
                </span>
                <span className={s.timelineStepTime}>Paso 02 · A su propio ritmo</span>
              </div>
              <h3 className={s.timelineTitle}>El cliente cuenta su idea sin fricción (0 registros)</h3>
              <p className={s.timelineDesc}>
                Tu cliente hace clic en el enlace desde su teléfono. No tiene que inventar contraseñas, ni bajarse software desconocido, ni completar formularios de 20 preguntas. Empieza a hablar exactamente como habla con cualquier persona.
              </p>

              <div className={s.timelineMockBox}>
                <div className={s.timelineMockHeader}>
                  <span>MENSAJES DEL CLIENTE // CERO FRICCIÓN</span>
                  <span>CLIENTE: ONLINE</span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>CL</div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '0.6rem 0.85rem', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                    🎙️ Audio de voz (03:15 min) — <em>&quot;Mirá, necesitamos un portal donde los clientes vean sus facturas, bajen comprobantes y hagan pedidos en cuenta corriente...&quot;</em>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  <span>✓ Soporta audios de WhatsApp/Telegram</span>
                  <span>·</span>
                  <span>✓ Fotos de pizarras y bocetos</span>
                  <span>·</span>
                  <span>✓ PDFs y capturas</span>
                </div>
              </div>
            </div>
          </div>

          {/* HITO 3 */}
          <div className={s.timelineItem}>
            <div className={s.timelineMarker}>
              <Cpu size={22} color="#fbbf24" />
            </div>
            <div className={s.timelineCard}>
              <span className={s.cardCornerGlint} style={{ color: '#fbbf24' }}>✦</span>
              <div className={s.timelineCardHeader}>
                <span className={`${s.timelineActorBadge} ${s.actorAi}`}>
                  🤖 Agente ScopeProfit (Con tu Gemini BYOK)
                </span>
                <span className={s.timelineStepTime}>Paso 03 · En tiempo real</span>
              </div>
              <h3 className={s.timelineTitle}>El agente interroga los puntos ciegos antes de que te exploten</h3>
              <p className={s.timelineDesc}>
                No es un chatbot complaciente que dice &quot;sí a todo&quot;. Está entrenado para detectar ambigüedades técnicas y hacer las preguntas incómodas que a vos se te pasan por alto o te da pereza indagar.
              </p>

              <div className={s.timelineMockBox}>
                <div className={s.timelineMockHeader}>
                  <span>RADAR DE ZONAS GRISES // 3 PREGUNTAS CRÍTICAS LANZADAS</span>
                  <span>STATUS: PREVINIENDO HORAS GRATIS</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.84rem' }}>
                    <span style={{ color: '#fbbf24' }}>⚠️</span>
                    <span><strong>Integración de Stock:</strong> &quot;¿El stock se sincroniza automáticamente con su sistema contable actual o se carga por planilla?&quot;</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.84rem' }}>
                    <span style={{ color: '#fbbf24' }}>⚠️</span>
                    <span><strong>Carga Inicial de Datos:</strong> &quot;¿Quién realiza la carga manual de los 2.000 artículos y sus fotografías?&quot;</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.84rem' }}>
                    <span style={{ color: '#fbbf24' }}>⚠️</span>
                    <span><strong>Pasarela de Cobro:</strong> &quot;¿Los pagos son con tarjeta en la plataforma o mediante transferencia bancaria contra factura?&quot;</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* HITO 4 */}
          <div className={s.timelineItem}>
            <div className={s.timelineMarker}>
              <ShieldCheck size={22} color="#c084fc" />
            </div>
            <div className={s.timelineCard}>
              <span className={s.cardCornerGlint} style={{ color: '#c084fc' }}>✦</span>
              <div className={s.timelineCardHeader}>
                <span className={`${s.timelineActorBadge} ${s.actorReview}`}>
                  ⚖️ Control Humano & Editor Web
                </span>
                <span className={s.timelineStepTime}>Paso 04 · Revisión del Dev</span>
              </div>
              <h3 className={s.timelineTitle}>Vos revisás el borrador, editás cláusulas y ponés tus reglas</h3>
              <p className={s.timelineDesc}>
                La IA jamás le entrega un presupuesto ni un alcance final a tu cliente por su cuenta. Vos recibís el informe clasificado en 6 secciones en tu panel, editás con el editor de texto y definís el rango de horas y tarifas.
              </p>

              <div className={s.timelineMockBox}>
                <div className={s.timelineMockHeader}>
                  <span>PANEL DE REVISIÓN // HUMAN-IN-THE-LOOP</span>
                  <span style={{ color: '#4ade80' }}>✓ CONTROL TOTAL DEL PROFESIONAL</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem' }}>
                    <strong style={{ color: 'var(--text-white)' }}>Borrador v0.4 clasificado:</strong> 8 requerimientos · 3 zonas grises aclaradas · 4 no-objetivos
                  </div>
                  <div style={{ background: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                    Estimado: 45 - 60 hrs
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Ajustás cualquier texto o cláusula legal antes de autorizar la emisión de los documentos de cierre.
                </div>
              </div>
            </div>
          </div>

          {/* HITO 5 */}
          <div className={s.timelineItem}>
            <div className={s.timelineMarker}>
              <FileCheck size={22} color="#34d399" />
            </div>
            <div className={s.timelineCard}>
              <span className={s.cardCornerGlint} style={{ color: '#34d399' }}>✦</span>
              <div className={s.timelineCardHeader}>
                <span className={`${s.timelineActorBadge} ${s.actorContract}`}>
                  📝 Cierre Comercial & Firma
                </span>
                <span className={s.timelineStepTime}>Paso 05 · Entrega Inmutable</span>
              </div>
              <h3 className={s.timelineTitle}>Descargás el PDF formal y el Word editable para firmar</h3>
              <p className={s.timelineDesc}>
                Con un clic descargás el PDF formal con anexo técnico numerado para anexar al contrato comercial y el Word (.docx) editable. Tu proyecto arranca blindado: si en la semana 4 te piden algo imprevisto, se cobra como orden de cambio.
              </p>

              <div className={s.timelineMockBox}>
                <div className={s.timelineMockHeader}>
                  <span>SALIDA DUAL GENERADA // LISTA PARA ANEXAR AL PRESUPUESTO</span>
                  <span style={{ color: '#34d399' }}>✓ FIRMABLE LEGALMENTE</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '180px', background: 'rgba(234, 40, 69, 0.08)', border: '1px solid rgba(234, 40, 69, 0.25)', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                    <strong style={{ display: 'block', color: 'var(--text-white)', fontSize: '0.85rem' }}>📄 Alcance-Portal-B2B.pdf</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PDF formal con índice y firma de conformidad</span>
                  </div>
                  <div style={{ flex: 1, minWidth: '180px', background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.25)', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                    <strong style={{ display: 'block', color: 'var(--text-white)', fontSize: '0.85rem' }}>📝 Alcance-Portal-B2B.docx</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Word editable con estilos para tu agencia</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ANATOMÍA DEL DOCUMENTO QUE GENERA EL SISTEMA */}
      <section id="anatomia-documento" className={s.section}>
        <div className={s.sectionHeader}>
          <span className={s.kicker}>
            <span className={s.sparkleMark}>✦</span>
            EL ENTREGABLE REAL
          </span>
          <h2 className={s.h2}>Anatomía del documento que te protege</h2>
          <p className={s.sectionSubtitle}>
            Cada alcance generado por ScopeProfit contiene estas 6 secciones contractuales estandarizadas:
          </p>
        </div>

        <div className={s.anatomyGrid}>
          <div className={s.anatomyCard}>
            <span className={s.cardCornerGlint} style={{ color: '#38bdf8' }}>✦</span>
            <div className={s.anatomyTop}>
              <div className={s.anatomyIcon} style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
                <MessageSquareQuote size={22} />
              </div>
            </div>
            <h4 className={s.anatomyTitle}>Requerimientos con Cita Textual</h4>
            <p className={s.anatomyText}>
              Cada funcionalidad queda respaldada con lo que el cliente dijo textualmente. Se terminan los debates de &quot;yo nunca te pedí eso&quot;.
            </p>
            <div className={s.anatomySnippet}>
              <strong>Ejemplo en el informe:</strong> &quot;El cliente solicitó en audio de las 14:20: &apos;Necesitamos que el listado se pueda exportar a Excel para el contador&apos;.&quot;
            </div>
          </div>

          <div className={s.anatomyCard}>
            <span className={s.cardCornerGlint} style={{ color: '#ea2845' }}>✦</span>
            <div className={s.anatomyTop}>
              <div className={s.anatomyIcon} style={{ background: 'rgba(234, 40, 69, 0.15)', color: '#ea2845' }}>
                <ShieldAlert size={22} />
              </div>
            </div>
            <h4 className={s.anatomyTitle}>Límites Claros: Lo que NO incluye</h4>
            <p className={s.anatomyText}>
              Una lista explícita de lo que queda afuera. Si más adelante el cliente lo quiere sumar, se cobra como una ampliación formal de presupuesto.
            </p>
            <div className={s.anatomySnippet}>
              <strong>Ejemplo en el informe:</strong> &quot;No incluye: Carga manual de los 2.000 productos existentes ni desarrollo de aplicación móvil para iPhone.&quot;
            </div>
          </div>

          <div className={s.anatomyCard}>
            <span className={s.cardCornerGlint} style={{ color: '#34d399' }}>✦</span>
            <div className={s.anatomyTop}>
              <div className={s.anatomyIcon} style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#34d399' }}>
                <BadgeCheck size={22} />
              </div>
            </div>
            <h4 className={s.anatomyTitle}>Criterios de Entrega Comprobables</h4>
            <p className={s.anatomyText}>
              Condiciones claras y objetivas para considerar terminado cada módulo, evitando que te retengan pagos por apreciaciones subjetivas.
            </p>
            <div className={s.anatomySnippet}>
              <strong>Ejemplo en el informe:</strong> &quot;Se considera terminado cuando el administrador pueda dar de alta un producto y recibir confirmación por email en menos de un minuto.&quot;
            </div>
          </div>

          <div className={s.anatomyCard}>
            <span className={s.cardCornerGlint} style={{ color: '#fbbf24' }}>✦</span>
            <div className={s.anatomyTop}>
              <div className={s.anatomyIcon} style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}>
                <HelpCircle size={22} />
              </div>
            </div>
            <h4 className={s.anatomyTitle}>Zonas Grises y Dudas Abiertas</h4>
            <p className={s.anatomyText}>
              Puntos ciegos que el cliente todavía debe definir. Si alguna duda traba el presupuesto, queda anotada por escrito antes de cotizar.
            </p>
            <div className={s.anatomySnippet}>
              <strong>Ejemplo en el informe:</strong> &quot;Pendiente de respuesta del cliente: &apos;¿Quién nos va a entregar los accesos al servidor antes de comenzar?&apos;&quot;
            </div>
          </div>

          <div className={s.anatomyCard}>
            <span className={s.cardCornerGlint} style={{ color: '#fb923c' }}>✦</span>
            <div className={s.anatomyTop}>
              <div className={s.anatomyIcon} style={{ background: 'rgba(249, 115, 22, 0.12)', color: '#fb923c' }}>
                <AlertTriangle size={22} />
              </div>
            </div>
            <h4 className={s.anatomyTitle}>Riesgos y Dependencias Externas</h4>
            <p className={s.anatomyText}>
              Si el avance depende de que un tercero te entregue algo (APIs, cuentas bancarias, diseño), queda registrado para proteger tus tiempos.
            </p>
            <div className={s.anatomySnippet}>
              <strong>Ejemplo en el informe:</strong> &quot;Si la pasarela de pagos demora en aprobar la cuenta comercial, la fecha de entrega se corre sin penalización para el equipo.&quot;
            </div>
          </div>

          <div className={s.anatomyCard}>
            <span className={s.cardCornerGlint} style={{ color: '#c084fc' }}>✦</span>
            <div className={s.anatomyTop}>
              <div className={s.anatomyIcon} style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#c084fc' }}>
                <Timer size={22} />
              </div>
            </div>
            <h4 className={s.anatomyTitle}>Estimación de Horas por Módulo</h4>
            <p className={s.anatomyText}>
              Rango de tiempo estimado para cada parte del proyecto, permitiéndote presupuestar con margen de seguridad y sin sorpresas.
            </p>
            <div className={s.anatomySnippet}>
              <strong>Ejemplo en el informe:</strong> &quot;Módulo de Usuarios y Permisos: estimado entre 16 y 22 horas de desarrollo con margen de incertidumbre bajo.&quot;
            </div>
          </div>
        </div>
      </section>

      {/* SECCION PROBLEMA (TERMINAL EXCEPTIONS) */}
      <section className={s.section}>
        <div className={s.sectionHeader}>
          <span className={s.kicker}>
            <span className={s.sparkleMark}>✦</span>
            LO QUE PASA CUANDO NO SE DEFINE EL ALCANCE
          </span>
          <h2 className={s.h2}>Frases que te cuestan miles de dólares</h2>
          <p className={s.sectionSubtitle}>
            El 85% de los proyectos con pérdidas económicas no fallan por mala programación, sino por ambigüedades toleradas en la primera conversación.
          </p>
        </div>

        <div className={s.problemGrid}>
          <div className={s.problemCard}>
            <span className={s.cardCornerGlint} style={{ color: '#ea2845' }}>✦</span>
            <span className={s.problemCode}>El supuesto que nadie aclaró</span>
            <p className={s.problemQuote}>&quot;Ah, pero yo asumí que el panel de reportes avanzados venía incluido en el precio.&quot;</p>
            <p className={s.problemContext}>Reunión semana 6: el cliente espera analítica predictiva y gráficos exportables en un MVP que cotizaste a precio cerrado.</p>
          </div>

          <div className={s.problemCard}>
            <span className={s.cardCornerGlint} style={{ color: '#ea2845' }}>✦</span>
            <span className={s.problemCode}>El &quot;favorcito&quot; de 30 horas no cobradas</span>
            <p className={s.problemQuote}>&quot;Faltan solo estos dos botoncitos y ya salimos a producción, no te cuesta nada.&quot;</p>
            <p className={s.problemContext}>Detrás de esos dos botones hay cambios de arquitectura, nuevas tablas y 30 horas de desarrollo que terminás regalando.</p>
          </div>

          <div className={s.problemCard}>
            <span className={s.cardCornerGlint} style={{ color: '#ea2845' }}>✦</span>
            <span className={s.problemCode}>La tarea sorpresa de último momento</span>
            <p className={s.problemQuote}>&quot;¿Y la migración de los datos viejos quién la hace? Pensé que la hacías vos.&quot;</p>
            <p className={s.problemContext}>Dos semanas antes de entregar, descubrís que nadie limpió una planilla con 40.000 registros y la fecha de entrega se te viene encima.</p>
          </div>
        </div>
      </section>

      {/* BENTO GRID DE CAPACIDADES */}
      <section id="features" className={s.section}>
        <div className={s.sectionHeader}>
          <span className={s.kicker}>
            <span className={s.sparkleMark}>✦</span>
            CAPACIDADES TÉCNICAS
          </span>
          <h2 className={s.h2}>Diseñado para desarrolladores y agencias serias</h2>
          <p className={s.sectionSubtitle}>
            Cada componente de ScopeProfit fue construido para eliminar fricción y proteger tu rentabilidad.
          </p>
        </div>

        <div className={s.bentoGrid}>
          <div className={s.bentoCard}>
            <span className={s.cardCornerGlint} style={{ color: '#34d399' }}>✦</span>
            <div className={s.bentoIcon} style={{ background: 'rgba(52, 211, 153, 0.12)', color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.25)' }}>
              <Lock size={22} />
            </div>
            <h3 className={s.bentoTitle}>Bring Your Own Key (BYOK)</h3>
            <p className={s.bentoText}>
              Conectás tu propia clave de Google Gemini. Pagás el consumo a precio de costo oficial del proveedor, sin intermediarios ni suscripciones infladas.
            </p>
            <div className={s.bentoMicroBadge}>
              <span style={{ color: '#34d399' }}>Google Gemini API</span>
              <span>·</span>
              <span>$0 comisión extra</span>
            </div>
          </div>

          <div className={s.bentoCard}>
            <span className={s.cardCornerGlint} style={{ color: '#38bdf8' }}>✦</span>
            <div className={s.bentoIcon} style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.25)' }}>
              <FileSpreadsheet size={22} />
            </div>
            <h3 className={s.bentoTitle}>PDF Formal y Word (.docx) Editable</h3>
            <p className={s.bentoText}>
              Tu cliente recibe un PDF sellado listo para firma y vos te quedás con el archivo .docx editable con estilos tipográficos para adaptarlo a la identidad de tu agencia.
            </p>
            <div className={s.bentoMicroBadge}>
              <span style={{ color: '#38bdf8' }}>PDF para firma</span>
              <span>·</span>
              <span>Word 100% editable</span>
            </div>
          </div>

          <div className={s.bentoCard}>
            <span className={s.cardCornerGlint} style={{ color: '#ea2845' }}>✦</span>
            <div className={s.bentoIcon} style={{ background: 'rgba(234, 40, 69, 0.15)', color: '#ea2845', borderColor: 'rgba(234, 40, 69, 0.3)' }}>
              <UserCheck size={22} />
            </div>
            <h3 className={s.bentoTitle}>Control Total: Vos tenés la última palabra</h3>
            <p className={s.bentoText}>
              La IA te asiste analizando y redactando, pero jamás habla con tu cliente a tus espaldas ni emite presupuestos sola. Vos revisás cada punto, editás y aprobás antes de emitir.
            </p>
            <div className={s.bentoMicroBadge}>
              <span style={{ color: '#ea2845' }}>Borrador IA</span>
              <span>➔</span>
              <span style={{ color: '#fff' }}>Tu Revisión Web</span>
              <span>➔</span>
              <span style={{ color: '#34d399' }}>Aprobado</span>
            </div>
          </div>

          <div className={s.bentoCard}>
            <span className={s.cardCornerGlint} style={{ color: '#fbbf24' }}>✦</span>
            <div className={s.bentoIcon} style={{ background: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.25)' }}>
              <MessageSquare size={22} />
            </div>
            <h3 className={s.bentoTitle}>Cero Fricción para el Cliente</h3>
            <p className={s.bentoText}>
              Tu cliente no tiene que crearse usuarios, recordar contraseñas ni aprender herramientas complejas. Envía audios o mensajes por Telegram exactamente como acostumbra.
            </p>
            <div className={s.bentoMicroBadge}>
              <span style={{ color: '#fbbf24' }}>Telegram Nativo</span>
              <span>·</span>
              <span>0 registros requeridos</span>
            </div>
          </div>

          <div className={s.bentoCard}>
            <span className={s.cardCornerGlint} style={{ color: '#c084fc' }}>✦</span>
            <div className={s.bentoIcon} style={{ background: 'rgba(192, 132, 252, 0.12)', color: '#c084fc', borderColor: 'rgba(192, 132, 252, 0.25)' }}>
              <Terminal size={22} />
            </div>
            <h3 className={s.bentoTitle}>Detección de No-Objetivos</h3>
            <p className={s.bentoText}>
              El motor genera automáticamente la sección &quot;Excluido del Alcance&quot; para blindarte legalmente contra pedidos imprevistos o tareas fuera de presupuesto.
            </p>
            <div className={s.bentoMicroBadge}>
              <span style={{ color: '#c084fc' }}>Límites precisos</span>
              <span>·</span>
              <span>Sin horas regaladas</span>
            </div>
          </div>

          <div className={s.bentoCard}>
            <span className={s.cardCornerGlint} style={{ color: '#fb923c' }}>✦</span>
            <div className={s.bentoIcon} style={{ background: 'rgba(251, 146, 60, 0.12)', color: '#fb923c', borderColor: 'rgba(251, 146, 60, 0.25)' }}>
              <Cpu size={22} />
            </div>
            <h3 className={s.bentoTitle}>Criterios de Aceptación Claros</h3>
            <p className={s.bentoText}>
              Cada requerimiento incluye su Definition of Done (DoD) verificable para que no haya debates subjetivos sobre cuándo un entregable está terminado.
            </p>
            <div className={s.bentoMicroBadge}>
              <span style={{ color: '#fb923c' }}>DoD Verificable</span>
              <span>·</span>
              <span>Cero ambigüedad</span>
            </div>
          </div>
        </div>
      </section>

      {/* BANNER CTA FINAL */}
      <section className={s.section}>
        <div className={s.finalBanner}>
          <h2>¿Listo para blindar tu próximo proyecto?</h2>
          <p>
            Dejá de presupuestar a ciegas. Transformá la próxima charla de Telegram en un alcance indiscutible en 12 minutos.
          </p>
          <Link href="/login" className={s.btnPrimary} style={{ padding: '1.1rem 2.2rem', fontSize: '1.1rem' }}>
            Comenzar ahora gratis
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* COMPACT MODERN FOOTER */}
      <footer className={s.footerCompact}>
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
            <a href="#flujo-exacto" className={s.footerCompactLink}>Paso a paso</a>
            <a href="#anatomia-documento" className={s.footerCompactLink}>El Entregable</a>
            <a href="#features" className={s.footerCompactLink}>Capacidades</a>
            <Link href="/faq" className={s.footerCompactLink}>Preguntas Frecuentes</Link>
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
            <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Volver arriba ↑</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
