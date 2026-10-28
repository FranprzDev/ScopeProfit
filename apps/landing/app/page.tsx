import type { Metadata } from 'next';
import Image from 'next/image';
import { buildPageMetadata } from '@/lib/seo';
import { SitePath } from '@/lib/site';
import { MCP_DOCS_URL, REPO_URL } from './content';
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
          <a href="#conectar">Instalación</a>
          <a href={REPO_URL}>GitHub</a>
        </nav>
      </header>
      <main>
        <section className={s.hero} aria-labelledby="hero-title">
          <h1 id="hero-title" data-reveal>
            Del pedido
            <span>al alcance.</span>
          </h1>
          <div className={s.heroBottom}>
            <p data-reveal>
              ScopeProfit ayuda a tu agente de IA a convertir lo que pide un cliente en un documento
              que define qué vas a construir.
            </p>
            <a href="#ejemplo" className={s.button} data-reveal>
              Ver un ejemplo
            </a>
          </div>
        </section>

        <section id="ejemplo" className={s.example} aria-labelledby="example-title">
          <div className={s.exampleIntro}>
            <h2 id="example-title" data-reveal>
              Que quede claro.
            </h2>
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

        <section className={s.connection} id="conectar" aria-labelledby="connection-title">
          <h2 id="connection-title" data-reveal>
            En tu agente.
            <br />
            En tu servidor.
          </h2>
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
            </a>
            <p className={s.note}>
              La prueba con ChatGPT usó una conexión privada temporal. No es una app publicada en su
              directorio.
            </p>
          </div>
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
      </footer>
    </div>
  );
}
