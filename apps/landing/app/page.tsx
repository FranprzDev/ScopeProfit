import type { Metadata } from 'next';
import Image from 'next/image';
import { buildPageMetadata } from '@/lib/seo';
import { SitePath } from '@/lib/site';
import { FAQ_ENTRIES, MCP_DOCS_URL, REPO_URL } from './content';
import { PageMotion } from './page-motion';
import { ToolFinder } from './tool-finder';
import s from './landing.module.css';

export const metadata: Metadata = buildPageMetadata(SitePath.Home);

export default function Home() {
  return (
    <div className={s.page} id="inicio">
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
          <p className={s.overline} data-reveal>
            Servidor MCP · Open source · Autohosteable
          </p>
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
          <div className={s.heroBottom}>
            <p data-reveal>
              ScopeProfit ayuda a tu agente de IA a convertir lo que pide un cliente en un documento
              que define qué vas a construir, y en un presupuesto que sale de tu propia tarifa.
            </p>
            <a href="#ejemplo" className={s.button} data-reveal>
              Ver un ejemplo
              <span className={s.buttonArrow} aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </section>

        <section id="ejemplo" className={s.example} aria-labelledby="example-title">
          <div className={s.exampleIntro}>
            <div>
              <p className={s.overline} data-reveal>
                El ejemplo
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
            <div className={s.request} data-reveal>
              <h3>El pedido</h3>
              <blockquote>
                &quot;Quiero una web para mostrar 12 paquetes de viajes, filtrar por destino y
                recibir consultas por WhatsApp.&quot;
              </blockquote>
              <p>Un mensaje es un punto de partida. Todavía hay decisiones por tomar.</p>
            </div>
            <div className={s.answer} data-reveal>
              <h3>El alcance, al aclararlo</h3>
              <dl>
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
              <p>
                En la prueba, el cliente confirmó que aportaría esos materiales y el hosting. El
                documento guardó la respuesta.
              </p>
            </div>
          </div>
          <div className={s.documentIntro}>
            <p data-reveal>
              El resultado es un documento versionado, con requisitos citados, riesgos y horas
              orientativas. Lo exportás a PDF o Word para revisarlo.
            </p>
            <p className={s.note}>
              PDF real de la prueba. Abrí una página para verla completa. Las horas no son un
              precio.
            </p>
          </div>
          <div className={s.documents}>
            <figure data-reveal>
              <a href="/images/demo/resumen.webp" target="_blank" rel="noreferrer">
                <Image
                  src="/images/demo/resumen.webp"
                  alt="Resumen del documento real de Agencia Horizonte, versión 23"
                  sizes="(max-width: 800px) 45vw, 23vw"
                  width={920}
                  height={1300}
                />
              </a>
              <figcaption>Resumen</figcaption>
            </figure>
            <figure data-reveal>
              <a href="/images/demo/requisitos.webp" target="_blank" rel="noreferrer">
                <Image
                  src="/images/demo/requisitos.webp"
                  alt="Requisitos con sus citas del caso ficticio"
                  sizes="(max-width: 800px) 45vw, 23vw"
                  width={920}
                  height={1300}
                />
              </a>
              <figcaption>Requisitos citados</figcaption>
            </figure>
            <figure data-reveal>
              <a href="/images/demo/excluidos.webp" target="_blank" rel="noreferrer">
                <Image
                  src="/images/demo/excluidos.webp"
                  alt="Listado completo de lo excluido y supuestos del proyecto"
                  sizes="(max-width: 800px) 45vw, 23vw"
                  width={920}
                  height={1300}
                />
              </a>
              <figcaption>Fuera del alcance</figcaption>
            </figure>
            <figure data-reveal>
              <a href="/images/demo/horas.webp" target="_blank" rel="noreferrer">
                <Image
                  src="/images/demo/horas.webp"
                  alt="Criterios de aceptación y estimación orientativa en horas, no precios"
                  sizes="(max-width: 800px) 45vw, 23vw"
                  width={920}
                  height={1300}
                />
              </a>
              <figcaption>Horas y criterios</figcaption>
            </figure>
          </div>
        </section>

        <section id="presupuesto" className={s.quote} aria-labelledby="quote-title">
          <div className={s.quoteIntro}>
            <p className={s.overline} data-reveal>
              El presupuesto
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
            <p className={s.overline} data-reveal>
              Instalación
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
            <p className={s.overline} data-reveal>
              Preguntas
            </p>
            <h2 id="faq-title" data-reveal>
              Lo que <em className={s.accent}>preguntan.</em>
            </h2>
          </div>
          <dl className={s.faqList}>
            {FAQ_ENTRIES.map((entry) => (
              <div className={s.faqItem} key={entry.question} data-reveal>
                <dt>{entry.question}</dt>
                <dd>{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={s.technical} id="herramientas" aria-label="Referencia técnica">
          <details>
            <summary>¿Qué herramientas usa el agente?</summary>
            <p>
              Este buscador muestra el catálogo. No ejecuta herramientas ni envía lo que escribís.
            </p>
            <ToolFinder />
          </details>
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
