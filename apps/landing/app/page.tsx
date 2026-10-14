/* eslint-disable @next/next/no-img-element -- static, pre-sized pictures from public/images; the standalone server has no image optimizer configured */
import {
  API_KEY_SNIPPET,
  BRIDGE_SNIPPET,
  CLAUDE_CODE_SNIPPET,
  CURL_SNIPPET,
  KIND_LABEL,
  MCP_DOCS_URL,
  MCP_ENDPOINT_PLACEHOLDER,
  PHOTOS,
  REPO_URL,
  SDK_SNIPPET,
  STAGES,
  STDIO_SNIPPET,
  TELEGRAM_COMMANDS,
  TOOL_COUNT,
  TOOL_GROUPS,
  ToolKind,
} from './content';
import { PageMotion } from './page-motion';
import { ToolFinder } from './tool-finder';
import s from './landing.module.css';

const kindClass: Record<ToolKind, string> = {
  [ToolKind.Read]: s.kindRead,
  [ToolKind.Write]: s.kindWrite,
  [ToolKind.Destructive]: s.kindDestructive,
};

const stageClass = [s.stageA, s.stageB, s.stageC];

function Code({ children }: { children: string }) {
  return (
    <pre className={s.code}>
      <code>{children}</code>
    </pre>
  );
}

function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

const NAV_LINKS = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#herramientas', label: 'Herramientas' },
  { href: '#conectar', label: 'Conectar' },
  { href: '#telegram', label: 'Telegram' },
];

const photoList = Object.values(PHOTOS);

export default function Home() {
  return (
    <div className={s.page}>
      <PageMotion />

      <header className={s.header} data-header data-ink="light">
        <a href="#" className={s.wordmark}>
          ScopeProfit
        </a>
        <nav className={s.nav} aria-label="Secciones">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={s.navLink}>
              {link.label}
            </a>
          ))}
        </nav>
        <details className={s.menu}>
          <summary className={s.menuToggle}>Menú</summary>
          <div className={s.menuPanel}>
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className={s.menuLink}>
                {link.label}
              </a>
            ))}
          </div>
        </details>
        <ExternalLink href={MCP_DOCS_URL} className={s.headerAction}>
          Guía MCP
        </ExternalLink>
      </header>

      <main>
        <section className={s.hero} data-field="light" aria-labelledby="hero-title">
          <div className={s.heroLower} data-field="accent" />
          <div className={s.heroTitle}>
            <h1 id="hero-title" className={`${s.heroLine} ${s.heroLineTop}`}>
              Cerrá el
              <br />
              alcance
            </h1>
            <span
              className={`${s.heroLine} ${s.heroLineBottom}`}
              data-text={'Cerrá el\nalcance'}
              aria-hidden="true"
            />
          </div>
          <p className={s.heroLead}>
            Antes de cotizar, desde el agente de IA que ya usás. ScopeProfit es un servidor MCP que
            convierte la idea desordenada de un cliente en un documento de alcance versionado.
          </p>
        </section>

        <section
          id="como-funciona"
          className={s.stages}
          data-field="light"
          aria-labelledby="stages-title"
        >
          <h2 id="stages-title" className={s.headLarge} data-reveal>
            Tres pasos, un documento
          </h2>
          <ol className={s.stageBar} data-ui data-reveal>
            {STAGES.map((stage, index) => (
              <li
                key={stage.tools[0]}
                className={`${s.stageSegment} ${stageClass[index]}`}
                style={{ flexGrow: stage.tools.length }}
              >
                <span className={s.stageCount}>{stage.tools.length} herramientas</span>
                <code className={s.stageTools}>{stage.tools.join(' · ')}</code>
              </li>
            ))}
          </ol>
          <div className={s.stageClauses}>
            {STAGES.map((stage) => (
              <p
                key={stage.tools[0]}
                className={s.stageClause}
                style={{ flexGrow: stage.tools.length }}
                data-reveal
              >
                <strong>{stage.order}</strong> {stage.clause}
              </p>
            ))}
          </div>
        </section>

        <section
          id="que-hace"
          className={s.features}
          data-field="light"
          aria-labelledby="features-title"
        >
          <h2 id="features-title" className="sr-only">
            Qué hace
          </h2>
          <p className={s.statement} data-reveal>
            Cada requerimiento cita al cliente{' '}
            <span className={`${s.slot} ${s.slotPhoto}`}>
              <img src={PHOTOS.plat.file} alt="" width={1024} height={832} />
            </span>
            , lo que falta queda como pregunta{' '}
            <span className={`${s.slot} ${s.slotAccent}`} data-ui>
              bloquea
            </span>{' '}
            y las horas salen en rango{' '}
            <span className={`${s.slot} ${s.slotInk}`} data-ui>
              24–40 h
            </span>
            , nunca como precio.
          </p>
          <div className={s.featureDetail}>
            <p data-reveal>
              <strong>Requerimientos con cita textual.</strong> Cada requerimiento funcional o no
              funcional cita, palabra por palabra, el mensaje del cliente del que sale. Si la cita
              no coincide, el servidor lo rechaza.
            </p>
            <p data-reveal>
              <strong>Preguntas bloqueantes y riesgos.</strong> Lo que falta definir queda por
              escrito. Los riesgos llevan semáforo, y no se puede aprobar con preguntas que bloqueen
              la estimación o riesgos en rojo sin mitigación.
            </p>
            <p data-reveal>
              <strong>Alcance, horas y próximos pasos.</strong> Qué incluye, qué no incluye,
              supuestos y criterios de aceptación. La estimación es un rango de horas por módulo,
              nunca un precio. Todo sale en la plantilla fija 7.1 y se exporta a Markdown, PDF y
              Word (.docx) editable.
            </p>
            <p data-reveal>
              <strong>Ya no hay una app web de chat.</strong> La conversación con el material del
              cliente pasa en el asistente que ya tenés abierto; ScopeProfit guarda el brief, arma
              el documento y exporta PDF y Word. El bot de Telegram para el profesional sigue
              funcionando.
            </p>
            <a href="#conectar" className={s.button} data-reveal>
              Cómo conectarlo
            </a>
          </div>
        </section>

        <figure className={s.band} data-field="light">
          <div className={s.bandFrame}>
            <img
              src={PHOTOS.plat.file}
              alt={PHOTOS.plat.alt}
              width={1024}
              height={832}
              loading="lazy"
              className={s.bandImage}
            />
          </div>
          <figcaption className={s.bandCaption} data-reveal>
            Un plano de mensura fija qué entra en la parcela y qué no. Un documento de alcance hace
            lo mismo con un proyecto.
          </figcaption>
        </figure>

        <section
          id="herramientas"
          className={s.tools}
          data-field="light"
          aria-labelledby="tools-title"
        >
          <h2 id="tools-title" className={s.toolsTitle} data-reveal>
            Una herramienta
            <br />
            por tarea
          </h2>
          <div className={s.toolsGrid}>
            <div className={s.toolsAside}>
              <p className={s.toolsIntro} data-reveal>
                Son {TOOL_COUNT} herramientas MCP. Cada una indica si solo lee, si escribe o si es
                destructiva, para que el asistente te pida confirmación cuando corresponde.
              </p>
              <img
                src={PHOTOS.map.file}
                alt={PHOTOS.map.alt}
                width={1600}
                height={856}
                loading="lazy"
                className={s.toolsPhoto}
                data-reveal
              />
            </div>
            <table className={s.toolTable}>
              <caption className="sr-only">Herramientas del servidor MCP de ScopeProfit</caption>
              {TOOL_GROUPS.map((group) => (
                <tbody key={group.title} className={s.toolGroup}>
                  <tr>
                    <th scope="rowgroup" colSpan={2} className={s.toolGroupHead} data-reveal>
                      {group.title}
                    </th>
                  </tr>
                  <tr>
                    <td colSpan={2} className={s.toolGroupText}>
                      {group.description}
                    </td>
                  </tr>
                  {group.tools.map((tool) => (
                    <tr key={tool.name} className={s.toolRow}>
                      <td className={s.toolCell}>
                        <code className={s.toolName}>{tool.name}</code>
                        <span className={s.toolText}>{tool.text}</span>
                      </td>
                      <td className={s.toolKindCell}>
                        <span className={`${s.kind} ${kindClass[tool.kind]}`}>
                          {KIND_LABEL[tool.kind]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>

        <section className={s.finderSection} data-field="accent" aria-labelledby="finder-title">
          <h2 id="finder-title" className="sr-only">
            Qué herramienta usaría tu asistente
          </h2>
          <ToolFinder />
        </section>

        <section
          id="conectar"
          className={s.connect}
          data-field="light"
          aria-labelledby="connect-title"
        >
          <div className={s.connectHead}>
            <div className={s.connectHeadText}>
              <h2 id="connect-title" className={s.headLarge} data-reveal>
                Una URL y una API key
              </h2>
              <p className={s.connectLead} data-reveal>
                El servidor habla MCP por Streamable HTTP y también por stdio para correrlo local.
              </p>
              <div className={s.endpoint} data-reveal>
                <code className={s.endpointValue}>{MCP_ENDPOINT_PLACEHOLDER}</code>
                <p className={s.endpointNote}>
                  Es un ejemplo: reemplazalo por la URL pública de tu API (
                  <code>PUBLIC_API_URL</code>) seguida de <code>/api/mcp</code>. La API tiene que
                  estar expuesta directo por HTTPS, porque el descubrimiento OAuth vive en la raíz
                  del dominio.
                </p>
              </div>
            </div>
            <img
              src={PHOTOS.theodolite.file}
              alt={PHOTOS.theodolite.alt}
              width={900}
              height={1293}
              loading="lazy"
              className={s.connectPhoto}
              data-reveal
            />
          </div>

          <div className={s.connectRow}>
            <div className={s.connectText}>
              <h3 className={s.headSmall} data-reveal>
                Primero, una API key
              </h3>
              <p data-reveal>
                Las keys (<code>sp_live_…</code>) se asocian a tu Telegram id autorizado. Solo se
                guarda su hash, y revocar una key corta todos los conectores que la usan.
              </p>
            </div>
            <div className={s.connectProof} data-reveal>
              <Code>{API_KEY_SNIPPET}</Code>
            </div>
          </div>

          <div className={s.connectRow}>
            <div className={s.connectText}>
              <h3 className={s.headSmall} data-reveal>
                ChatGPT, en developer mode
              </h3>
              <p data-reveal>
                Se conecta por OAuth: ChatGPT se registra solo y vos pegás tu API key en la pantalla
                de consentimiento de ScopeProfit.
              </p>
            </div>
            <ol className={s.connectSteps} data-reveal>
              <li>
                En <strong>Settings → Apps &amp; Connectors → Advanced</strong> activá{' '}
                <strong>Developer mode</strong>. Necesita plan pago; en Business, Enterprise o Edu
                un admin tiene que permitir conectores personalizados. Los nombres de los menús
                cambian entre versiones.
              </li>
              <li>
                Creá un conector: nombre <code>ScopeProfit</code>, la URL del endpoint y
                autenticación <strong>OAuth</strong>. Dejá vacíos client id y secret: ChatGPT se
                registra solo.
              </li>
              <li>
                Se abre la pantalla de consentimiento de ScopeProfit: pegás tu API key y tocás{' '}
                <strong>Allow access</strong>.
              </li>
              <li>
                En un chat activás el conector y pedís, por ejemplo: &quot;Creá un proyecto de
                ScopeProfit para la app de turnos de Acme y cargá este brief: …&quot;.
              </li>
            </ol>
          </div>

          <div className={s.connectRow}>
            <div className={s.connectText}>
              <h3 className={s.headSmall} data-reveal>
                Claude y Claude Desktop
              </h3>
              <p data-reveal>
                En <strong>Settings → Connectors → Add custom connector</strong> cargás la URL del
                endpoint. Podés dejar OAuth (la misma pantalla de consentimiento que en ChatGPT) o,
                si tu plan ofrece <strong>Request headers</strong>, mandar{' '}
                <code>Authorization: Bearer sp_live_…</code>. En Claude Code alcanza con un comando.
              </p>
            </div>
            <div className={s.connectProof} data-reveal>
              <Code>{CLAUDE_CODE_SNIPPET}</Code>
            </div>
          </div>

          <div className={s.connectRow}>
            <div className={s.connectText}>
              <h3 className={s.headSmall} data-reveal>
                Cursor y otros hosts stdio
              </h3>
              <p data-reveal>
                Opción local para Cursor, Claude Desktop y cualquier host stdio: el proceso corre
                las herramientas contra tu propia base de datos. Primero compilás la API y después
                lo agregás a la config MCP del host. Para usar el servidor remoto desde un host que
                solo soporta stdio, hacé de puente con <code>mcp-remote</code>.
              </p>
            </div>
            <div className={s.connectProof} data-reveal>
              <Code>{STDIO_SNIPPET}</Code>
              <Code>{BRIDGE_SNIPPET}</Code>
            </div>
          </div>

          <div className={s.connectRow}>
            <div className={s.connectText}>
              <h3 className={s.headSmall} data-reveal>
                Cualquier cliente MCP
              </h3>
              <p data-reveal>
                Cualquier host o agente que hable MCP por Streamable HTTP con un header{' '}
                <code>Authorization: Bearer</code> funciona: el SDK oficial de TypeScript, la
                Responses API o el Agents SDK de OpenAI, el MCP Inspector, o HTTP directo. Los
                ejemplos completos están en{' '}
                <ExternalLink href={MCP_DOCS_URL} className={s.textLink}>
                  docs/mcp.md
                </ExternalLink>
                .
              </p>
            </div>
            <div className={s.connectProof} data-reveal>
              <Code>{SDK_SNIPPET}</Code>
              <Code>{CURL_SNIPPET}</Code>
            </div>
          </div>
        </section>

        <section
          id="telegram"
          className={s.telegram}
          data-field="dark"
          aria-labelledby="telegram-title"
        >
          <h2 id="telegram-title" className="sr-only">
            Telegram
          </h2>
          <p className={s.telegramSentence} data-reveal>
            Si ya usabas Telegram, nada cambia: el bot usa el mismo backend que el servidor MCP.
          </p>
          <img
            src={PHOTOS.surveyor.file}
            alt={PHOTOS.surveyor.alt}
            width={900}
            height={1233}
            loading="lazy"
            className={s.telegramPhoto}
            data-reveal
          />
          <div className={s.telegramSide}>
            <p className={s.telegramQuestion} data-reveal>
              ¿Qué hacés desde el bot?
            </p>
            <p className={s.telegramText} data-reveal>
              Creás y listás proyectos, mirás el resumen y el documento, mandás texto o imágenes,
              archivás y aprobás o rechazás con los botones del bot.
            </p>
            <p className={s.commands} data-reveal>
              {TELEGRAM_COMMANDS.map((command) => (
                <code key={command}>{command}</code>
              ))}
            </p>
            <div className={s.telegramLinks} data-reveal>
              <ExternalLink href={MCP_DOCS_URL} className={s.textLink}>
                Leer docs/mcp.md
              </ExternalLink>
              <ExternalLink href={REPO_URL} className={s.textLink}>
                Ver el código en GitHub
              </ExternalLink>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer} data-field="dark">
        <div className={s.footerTop}>
          <div className={s.footerInvite}>
            <h2 className={s.headLarge} data-reveal>
              Conectalo paso a paso
            </h2>
            <p className={s.footerLead} data-reveal>
              Herramientas, autenticación (API key y OAuth 2.1), variables de despliegue y ejemplos
              para cada cliente MCP.
            </p>
            <ExternalLink href={MCP_DOCS_URL} className={s.button}>
              Abrir docs/mcp.md en GitHub
            </ExternalLink>
          </div>
          <nav className={s.footerLinks} aria-label="Pie de página">
            <a href="#herramientas">Herramientas</a>
            <a href="#conectar">Conectar</a>
            <ExternalLink href={MCP_DOCS_URL}>docs/mcp.md</ExternalLink>
            <ExternalLink href={REPO_URL}>GitHub</ExternalLink>
            <a href="#">Volver arriba</a>
          </nav>
        </div>
        <div className={s.footerLegal}>
          <p>
            &copy; {new Date().getFullYear()} ScopeProfit. Copiloto de alcance para freelancers y
            agencias, como servidor MCP.
          </p>
          <p>
            Imágenes de colecciones abiertas, sin relación con ScopeProfit:{' '}
            {photoList.map((photo, index) => (
              <span key={photo.file}>
                <ExternalLink href={photo.page}>{photo.title}</ExternalLink>
                {photo.creator ? `, ${photo.creator}` : ''} ({photo.license})
                {index < photoList.length - 1 ? '; ' : '.'}
              </span>
            ))}
          </p>
        </div>
        <p className={s.footerName} aria-hidden="true">
          ScopeProfit
        </p>
      </footer>
    </div>
  );
}
