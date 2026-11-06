import type { Metadata } from 'next';
import Image from 'next/image';
import { buildPageMetadata } from '@/lib/seo';
import { SitePath } from '@/lib/site';
import { FAQ_ENTRIES, MCP_DOCS_URL, REPO_URL } from './content';
import { PageMotion } from './page-motion';
import { Preloader } from './preloader';
import s from './landing.module.css';

export const metadata: Metadata = buildPageMetadata(SitePath.Home);

export default function Home() {
  return (
    <div className={s.page} id="inicio">
      <Preloader />
      <PageMotion />
      <header className={s.header}>
        <a href="#inicio" className={s.brand} aria-label="ScopeProfit, inicio">
          <Image
            src="/brand/wordmark.png"
            sizes="(max-width: 800px) 170px, 210px"
            alt="ScopeProfit"
            width={1740}
            height={400}
            priority
          />
        </a>
        <nav aria-label="Principal">
          <a href="#ejemplo">Ejemplo</a>
          <a href="#presupuesto">Presupuesto</a>
          <a href="#conectar">Instalación</a>
          <a href={REPO_URL}>GitHub</a>
        </nav>
      </header>
      <main>
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroInner}>
            <div className={s.heroCopy}>
              <h1 id="hero-title" data-reveal>
                Del pedido
                <span>
                  al{' '}
                  <em className={s.accentWord}>
                    alcance.
                    <svg
                      className={s.squiggle}
                      viewBox="0 0 200 12"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M4 8 C 40 2, 72 11, 108 6 S 172 2, 196 7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </em>
                </span>
              </h1>
              <p className={s.heroLead} data-reveal>
                ScopeProfit ayuda a tu agente de IA a convertir lo que pide un cliente en un
                documento que define qué vas a construir, y en un presupuesto que sale de tu propia
                tarifa.
              </p>
              <div className={s.heroCtas} data-reveal>
                <a href="#ejemplo" className={s.button}>
                  Ver un ejemplo
                  <span className={s.buttonArrow} aria-hidden="true">
                    →
                  </span>
                </a>
              </div>
            </div>
            <ol className={s.heroFlow} data-reveal>
              <li>
                <p className={s.heroFlowTitle}>El pedido</p>
                <p className={s.heroFlowText}>Lo que pide el cliente, en sus palabras.</p>
              </li>
              <li>
                <p className={s.heroFlowTitle}>El alcance</p>
                <p className={s.heroFlowText}>
                  Un documento versionado que define qué se construye.
                </p>
              </li>
              <li>
                <p className={s.heroFlowTitle}>El presupuesto</p>
                <p className={s.heroFlowText}>
                  Montos calculados con tu tarifa, listos para enviar.
                </p>
              </li>
            </ol>
          </div>
          <p className={s.heroMeta} data-reveal>
            Servidor MCP <span aria-hidden="true">·</span> Open source{' '}
            <span aria-hidden="true">·</span> Autohosteable
          </p>
        </section>

        <div className={s.marquee} aria-hidden="true">
          <div className={s.marqueeTrack}>
            {[0, 1].map((copy) => (
              <span key={copy}>
                El pedido, en sus palabras <i>✦</i> El alcance, en claro <i>✦</i> El presupuesto,
                con tu tarifa <i>✦</i>{' '}
              </span>
            ))}
          </div>
        </div>

        <section id="ejemplo" className={s.example} aria-labelledby="example-title">
          <div className={s.exampleIntro}>
            <div>
              <p className={s.chapter} data-reveal>
                <span>01</span> El ejemplo
              </p>
              <h2 id="example-title" data-reveal>
                Que quede <em className={s.accent}>claro.</em>
              </h2>
            </div>
            <p data-reveal>
              Un caso ficticio de una agencia de viajes, trabajado con ScopeProfit dentro de
              ChatGPT.
            </p>
          </div>
          <div className={s.exchange} id="como-funciona">
            <div className={s.beat} data-reveal>
              <p className={s.stepLabel}>El pedido</p>
              <blockquote className={s.requestQuote}>
                &quot;Quiero una web para mostrar 12 paquetes de viajes, filtrar por destino y
                recibir consultas por WhatsApp.&quot;
              </blockquote>
              <p className={s.requestNote}>
                Un mensaje es un punto de partida. Todavía hay decisiones por tomar.
              </p>
            </div>
            <div className={s.beat} data-reveal>
              <p className={s.stepLabel}>El alcance, al aclararlo</p>
              <dl className={s.answerList}>
                <div>
                  <dt>Incluye</dt>
                  <dd>Catálogo, filtro por destino y un administrador para cargar paquetes.</dd>
                </div>
                <div>
                  <dt>No incluye</dt>
                  <dd>Pagos online, reservas en tiempo real ni cuentas de viajeros.</dd>
                </div>
                <div>
                  <dt>Duda a resolver</dt>
                  <dd>Quién aporta los textos, las fotos y el hosting.</dd>
                </div>
              </dl>
              <p className={s.answerNote}>
                En la prueba, el cliente confirmó que aportaría esos materiales y el hosting. El
                documento guardó la respuesta.
              </p>
            </div>
          </div>
          <p className={s.exampleOutro} data-reveal>
            El resultado es un documento versionado, con requisitos citados, riesgos y horas
            orientativas. Lo exportás a PDF o Word para revisarlo.
          </p>
        </section>

        <section id="presupuesto" className={s.quote} aria-labelledby="quote-title">
          <div className={s.quoteIntro}>
            <p className={s.chapter} data-reveal>
              <span>02</span> El presupuesto
            </p>
            <h2 id="quote-title" data-reveal>
              Del alcance al <em className={s.accent}>presupuesto.</em>
            </h2>
            <p data-reveal>
              Aprobado el alcance, tu agente lo convierte en presupuesto: módulos con sus horas,
              montos calculados con tu tarifa, hitos de pago, condiciones y validez. Se exporta a
              PDF o Word, igual que el alcance.
            </p>
            <p className={s.quotePromise} data-reveal>
              ScopeProfit no sugiere precios. La tarifa es tuya.
            </p>
          </div>
          <div className={s.quoteCard} data-reveal>
            <div className={s.quoteCardHead}>
              <p className={s.quoteCardTitle}>Un presupuesto lleva</p>
              <span className={s.quoteTag}>Borrador</span>
            </div>
            <ul className={s.quoteList}>
              <li>Módulos con rangos de horas</li>
              <li>Montos calculados con tu tarifa</li>
              <li>Hitos de pago por porcentaje o monto fijo</li>
              <li>Condiciones y validez en lenguaje claro</li>
              <li>Estados: borrador, enviado, aceptado o rechazado</li>
            </ul>
            <p className={s.quoteCardFoot}>
              Se exporta a PDF o Word con un link firmado y con vencimiento.
            </p>
          </div>
        </section>

        <section className={s.connection} id="conectar" aria-labelledby="connection-title">
          <div>
            <p className={s.chapter} data-reveal>
              <span>03</span> La conexión
            </p>
            <h2 id="connection-title" data-reveal>
              En tu agente.
              <br />
              En tu <em className={s.accent}>servidor.</em>
            </h2>
          </div>
          <div className={s.connectionBody}>
            <p data-reveal>
              ScopeProfit es un servidor MCP: una conexión que le da herramientas a tu agente para
              guardar el proyecto, revisar el alcance y exportarlo.
            </p>
            <p data-reveal>
              Es open source y lo alojás vos. Necesitás instalar el backend, configurar una base de
              datos y conectarlo a un cliente MCP compatible. Esta web no es un servicio de chat.
            </p>
            <a className={s.button} href={MCP_DOCS_URL} data-reveal>
              Guía de instalación
              <span className={s.buttonArrow} aria-hidden="true">
                →
              </span>
            </a>
            <p className={s.note}>
              La prueba con ChatGPT usó una conexión privada temporal. No es una app publicada en su
              directorio.
            </p>
          </div>
        </section>

        <section className={s.faq} id="preguntas" aria-labelledby="faq-title">
          <div>
            <p className={s.chapter} data-reveal>
              <span>04</span> Las preguntas
            </p>
            <h2 id="faq-title" data-reveal>
              Lo que <em className={s.accent}>preguntan.</em>
            </h2>
          </div>
          <div className={s.faqList}>
            {FAQ_ENTRIES.map((entry) => (
              <details className={s.faqItem} key={entry.question} data-reveal>
                <summary>
                  {entry.question}
                  <span className={s.faqIcon} aria-hidden="true" />
                </summary>
                <p>{entry.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <a href={REPO_URL}>Código abierto en GitHub</a>
        <a href={MCP_DOCS_URL}>Documentación</a>
        <Image
          src="/brand/wordmark.png"
          alt="ScopeProfit"
          width={1744}
          height={400}
          className={s.footerMark}
        />
        <p className={s.footerMeta}>
          Open source bajo licencia MIT · Hecho por{' '}
          <a href="https://github.com/FranprzDev">FranPrzDev</a>
        </p>
      </footer>
    </div>
  );
}
