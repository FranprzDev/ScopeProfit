import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Code2,
  FileCheck,
  KeyRound,
  MessageSquare,
  Plug,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import {
  API_KEY_SNIPPET,
  BRIDGE_SNIPPET,
  CLAUDE_CODE_SNIPPET,
  CURL_SNIPPET,
  KIND_LABEL,
  MCP_DOCS_URL,
  MCP_ENDPOINT_PLACEHOLDER,
  REPO_URL,
  SDK_SNIPPET,
  STDIO_SNIPPET,
  TELEGRAM_COMMANDS,
  TOOL_GROUPS,
} from './content';
import s from './landing.module.css';

const kindClass = { read: s.kindRead, write: s.kindWrite, destructive: s.kindDestructive };

function Code({ children }: { children: string }) {
  return (
    <pre className={s.codeBlock}>
      <code>{children}</code>
    </pre>
  );
}

function DocsLink({ children }: { children: ReactNode }) {
  return (
    <a href={MCP_DOCS_URL} target="_blank" rel="noreferrer" className={s.inlineLink}>
      {children}
    </a>
  );
}

export default function Home() {
  return (
    <div className={s.page}>
      <div className={s.bgGrid} />
      <div className={s.bgGlow} />

      <header className={s.navWrapper}>
        <div className={s.navInner}>
          <Link href="/" className={s.brand}>
            <div className={s.brandLogo}>
              <Code2 />
            </div>
            <span>
              Scope<span className={s.brandRed}>Profit</span>
            </span>
          </Link>
          <nav className={s.navLinks}>
            <a href="#que-hace" className={s.navLink}>
              Qué hace
            </a>
            <a href="#herramientas" className={s.navLink}>
              Herramientas
            </a>
            <a href="#conectar" className={s.navLink}>
              Conectar
            </a>
            <a href="#telegram" className={s.navLink}>
              Telegram
            </a>
          </nav>
          <div className={s.navActions}>
            <a href={MCP_DOCS_URL} target="_blank" rel="noreferrer" className={s.navCta}>
              Guía MCP
              <ArrowRight size={15} />
            </a>
          </div>
        </div>
      </header>

      <section className={s.hero}>
        <div className={s.heroContent}>
          <div className={s.badge}>
            <span className={s.sparkleMark}>✦</span>
            <span>SERVIDOR MCP PARA FREELANCERS Y AGENCIAS DE SOFTWARE</span>
          </div>

          <h1 className={s.h1}>
            Cerrá el alcance antes de cotizar.
            <span className={s.h1Red}>Desde el agente de IA que ya usás.</span>
          </h1>

          <p className={s.lead}>
            Scope-to-Profit convierte la idea desordenada de un cliente (textos sueltos, capturas,
            &quot;quiero algo simple pero…&quot;) en un{' '}
            <strong>documento de alcance formal y versionado</strong>. Lo manejás desde ChatGPT,
            Claude, Cursor o tu propio agente, por el Model Context Protocol (MCP).
          </p>

          <div className={s.ctaRow}>
            <a href="#conectar" className={s.btnPrimary}>
              Cómo conectarlo
              <ArrowRight size={18} />
            </a>
            <a href={MCP_DOCS_URL} target="_blank" rel="noreferrer" className={s.btnSecondary}>
              <BookOpen size={18} />
              Leer docs/mcp.md en GitHub
            </a>
          </div>

          <div className={s.explainerBox}>
            <div className={s.explainerIcon}>
              <Plug size={24} />
            </div>
            <div className={s.explainerText}>
              <h3>Qué cambió: ya no hay una app web de chat</h3>
              <p>
                ScopeProfit dejó de tener su propia interfaz web. Ahora es un{' '}
                <strong>servidor MCP</strong>: la conversación con el material del cliente pasa en
                el asistente que ya tenés abierto, y ScopeProfit guarda el brief, arma el documento
                y exporta PDF y Word. El bot de <strong>Telegram</strong> para el profesional sigue
                funcionando.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="que-hace" className={s.section}>
        <div className={s.sectionHeader}>
          <span className={s.kicker}>
            <span className={s.sparkleMark}>✦</span>
            QUÉ HACE
          </span>
          <h2 className={s.h2}>Un documento de alcance que se puede defender</h2>
          <p className={s.sectionSubtitle}>
            Todo sale en la plantilla fija 7.1 y se exporta a Markdown, PDF y Word (.docx) editable.
          </p>
        </div>

        <div className={s.bentoGrid}>
          <div className={s.bentoCard}>
            <div className={s.bentoIcon}>
              <FileCheck size={22} />
            </div>
            <h3 className={s.bentoTitle}>Requerimientos con cita textual</h3>
            <p className={s.bentoText}>
              Cada requerimiento funcional o no funcional cita, palabra por palabra, el mensaje del
              cliente del que sale. Si la cita no coincide, el servidor lo rechaza.
            </p>
          </div>
          <div className={s.bentoCard}>
            <div className={s.bentoIcon}>
              <MessageSquare size={22} />
            </div>
            <h3 className={s.bentoTitle}>Preguntas bloqueantes y riesgos</h3>
            <p className={s.bentoText}>
              Lo que falta definir queda por escrito. Los riesgos llevan semáforo, y no se puede
              aprobar con preguntas que bloqueen la estimación o riesgos en rojo sin mitigación.
            </p>
          </div>
          <div className={s.bentoCard}>
            <div className={s.bentoIcon}>
              <ShieldCheck size={22} />
            </div>
            <h3 className={s.bentoTitle}>Alcance, horas y próximos pasos</h3>
            <p className={s.bentoText}>
              Qué incluye, qué no incluye, supuestos y criterios de aceptación. La estimación es un
              rango de horas por módulo, nunca un precio.
            </p>
          </div>
        </div>

        <div className={s.pipeline} style={{ marginTop: '1.5rem' }}>
          <div className={s.pipelineCard}>
            <span className={s.pipelineNum}>1</span>
            <h3 className={s.pipelineTitle}>Cargás lo que dijo el cliente</h3>
            <p className={s.pipelineText}>
              Pedile a tu asistente que cree el proyecto y pegue el brief del cliente y las URLs de
              sus capturas.
            </p>
            <span className={s.pipelineMeta}>create_project → add_client_input</span>
          </div>
          <div className={s.pipelineCard}>
            <span className={s.pipelineNum}>2</span>
            <h3 className={s.pipelineTitle}>Se arma el alcance</h3>
            <p className={s.pipelineText}>
              Lo redacta el propio modelo de tu asistente, sin otra clave de IA, o el agente del
              servidor (LangGraph + Gemini) con la clave de Gemini del dueño.
            </p>
            <span className={s.pipelineMeta}>update_scope_section · analyze: true</span>
          </div>
          <div className={s.pipelineCard}>
            <span className={s.pipelineNum}>3</span>
            <h3 className={s.pipelineTitle}>Cerrás dudas, revisás y aprobás</h3>
            <p className={s.pipelineText}>
              Respondés las preguntas abiertas, revisás la plantilla 7.1, aprobás y descargás PDF y
              DOCX con un link firmado.
            </p>
            <span className={s.pipelineMeta}>answer_question → approve_scope → export</span>
          </div>
        </div>
      </section>

      <section id="herramientas" className={s.section}>
        <div className={s.sectionHeader}>
          <span className={s.kicker}>
            <span className={s.sparkleMark}>✦</span>
            LAS 15 HERRAMIENTAS MCP
          </span>
          <h2 className={s.h2}>Lo que tu asistente puede hacer</h2>
          <p className={s.sectionSubtitle}>
            Cada herramienta indica si solo lee, si escribe o si es destructiva, para que el
            asistente te pida confirmación cuando corresponde.
          </p>
        </div>

        <div className={s.toolGroups}>
          {TOOL_GROUPS.map((group) => (
            <div key={group.title} className={s.toolGroup}>
              <h3 className={s.toolGroupTitle}>{group.title}</h3>
              <p className={s.toolGroupText}>{group.description}</p>
              <ul className={s.toolList}>
                {group.tools.map((tool) => (
                  <li key={tool.name} className={s.toolItem}>
                    <div className={s.toolHead}>
                      <code className={s.toolName}>{tool.name}</code>
                      <span className={`${s.toolKind} ${kindClass[tool.kind]}`}>
                        {KIND_LABEL[tool.kind]}
                      </span>
                    </div>
                    <p className={s.toolText}>{tool.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="conectar" className={s.section}>
        <div className={s.sectionHeader}>
          <span className={s.kicker}>
            <span className={s.sparkleMark}>✦</span>
            CÓMO CONECTARLO
          </span>
          <h2 className={s.h2}>Una URL y una API key</h2>
          <p className={s.sectionSubtitle}>
            El servidor habla MCP por Streamable HTTP y también por stdio para correrlo local.
          </p>
        </div>

        <div className={s.endpointBox}>
          <div className={s.endpointLabel}>ENDPOINT MCP</div>
          <code className={s.endpointValue}>{MCP_ENDPOINT_PLACEHOLDER}</code>
          <p className={s.endpointNote}>
            <strong>Placeholder:</strong> reemplazalo por la URL pública de tu API (
            <code>PUBLIC_API_URL</code>) seguida de <code>/api/mcp</code>. La API tiene que estar
            expuesta directo por HTTPS, porque el descubrimiento OAuth vive en la raíz del dominio.
          </p>
        </div>

        <div className={s.connectGrid}>
          <div className={s.connectCard}>
            <div className={s.bentoIcon}>
              <KeyRound size={22} />
            </div>
            <h3 className={s.bentoTitle}>0. Creá una API key</h3>
            <p className={s.bentoText}>
              Las keys (<code>sp_live_…</code>) se asocian a tu Telegram id autorizado. Solo se
              guarda su hash, y revocar una key corta todos los conectores que la usan.
            </p>
            <Code>{API_KEY_SNIPPET}</Code>
          </div>

          <div className={s.connectCard}>
            <div className={s.bentoIcon}>
              <Bot size={22} />
            </div>
            <h3 className={s.bentoTitle}>ChatGPT (developer mode)</h3>
            <ol className={s.steps}>
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

          <div className={s.connectCard}>
            <div className={s.bentoIcon}>
              <Bot size={22} />
            </div>
            <h3 className={s.bentoTitle}>Claude y Claude Desktop</h3>
            <p className={s.bentoText}>
              En <strong>Settings → Connectors → Add custom connector</strong> cargás la URL del
              endpoint. Podés dejar OAuth (la misma pantalla de consentimiento que en ChatGPT) o, si
              tu plan ofrece <strong>Request headers</strong>, mandar{' '}
              <code>Authorization: Bearer sp_live_…</code>.
            </p>
            <p className={s.bentoText} style={{ marginTop: '1rem' }}>
              <strong>Claude Code</strong>:
            </p>
            <Code>{CLAUDE_CODE_SNIPPET}</Code>
          </div>

          <div className={s.connectCard}>
            <div className={s.bentoIcon}>
              <Terminal size={22} />
            </div>
            <h3 className={s.bentoTitle}>Cursor, Claude Desktop y otros hosts stdio</h3>
            <p className={s.bentoText}>
              Opción local: el proceso stdio corre las herramientas contra tu propia base de datos.
              Primero compilás la API y después lo agregás a la config MCP del host.
            </p>
            <Code>{STDIO_SNIPPET}</Code>
            <p className={s.bentoText} style={{ marginTop: '1rem' }}>
              Para usar el servidor remoto desde un host que solo soporta stdio, hacé de puente:
            </p>
            <Code>{BRIDGE_SNIPPET}</Code>
          </div>

          <div className={`${s.connectCard} ${s.connectCardWide}`}>
            <div className={s.bentoIcon}>
              <Plug size={22} />
            </div>
            <h3 className={s.bentoTitle}>Cualquier cliente MCP</h3>
            <p className={s.bentoText}>
              Cualquier host o agente que hable MCP por Streamable HTTP con un header{' '}
              <code>Authorization: Bearer</code> funciona: el SDK oficial de TypeScript, la
              Responses API o el Agents SDK de OpenAI, el MCP Inspector, o HTTP directo. Los
              ejemplos completos están en <DocsLink>docs/mcp.md</DocsLink>.
            </p>
            <div className={s.codePair}>
              <Code>{SDK_SNIPPET}</Code>
              <Code>{CURL_SNIPPET}</Code>
            </div>
          </div>
        </div>
      </section>

      <section id="telegram" className={s.section}>
        <div className={s.sectionHeader}>
          <span className={s.kicker}>
            <span className={s.sparkleMark}>✦</span>
            TELEGRAM
          </span>
          <h2 className={s.h2}>El bot de Telegram sigue funcionando</h2>
          <p className={s.sectionSubtitle}>
            Si ya trabajabas desde Telegram, no cambia nada: el bot del profesional usa el mismo
            backend que el servidor MCP.
          </p>
        </div>
        <div className={s.telegramBox}>
          <div className={s.commandList}>
            {TELEGRAM_COMMANDS.map((command) => (
              <code key={command} className={s.commandChip}>
                {command}
              </code>
            ))}
          </div>
          <p className={s.bentoText}>
            Creás y listás proyectos, mirás el resumen y el documento, mandás texto o imágenes,
            archivás y aprobás o rechazás con los botones del bot.
          </p>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.finalBanner}>
          <h2>Toda la configuración, paso a paso</h2>
          <p>
            Herramientas, autenticación (API key y OAuth 2.1), variables de despliegue y ejemplos
            para cada cliente MCP.
          </p>
          <a
            href={MCP_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className={s.btnPrimary}
            style={{ padding: '1.1rem 2.2rem', fontSize: '1.1rem' }}
          >
            Abrir docs/mcp.md en GitHub
            <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <footer className={s.footerCompact}>
        <div className={s.footerCompactInner}>
          <div className={s.footerCompactBrand}>
            <Link href="/" className={s.brand}>
              <div className={s.brandLogo}>
                <Code2 />
              </div>
              <span>
                Scope<span className={s.brandRed}>Profit</span>
              </span>
            </Link>
            <span className={s.footerCompactTagline}>
              Copiloto de alcance para freelancers y agencias, como servidor MCP
            </span>
          </div>
          <nav className={s.footerCompactNav}>
            <a href="#herramientas" className={s.footerCompactLink}>
              Herramientas
            </a>
            <a href="#conectar" className={s.footerCompactLink}>
              Conectar
            </a>
            <a href={MCP_DOCS_URL} target="_blank" rel="noreferrer" className={s.footerCompactLink}>
              docs/mcp.md
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className={s.footerCompactLink}>
              GitHub
            </a>
          </nav>
        </div>
        <div className={s.footerCompactBottom}>
          <span>&copy; {new Date().getFullYear()} ScopeProfit.</span>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>
            Volver arriba ↑
          </a>
        </div>
      </footer>
    </div>
  );
}
