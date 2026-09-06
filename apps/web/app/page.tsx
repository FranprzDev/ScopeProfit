import Link from 'next/link';
import s from './landing.module.css';

export default function Home() {
  return (
    <main className={s.page}>
      {/* HERO */}
      <section className={s.hero}>
        <div className={s.heroInner}>
          <div>
            <span className={s.badge}>🎯 Para freelancers y agencias de software</span>
            <h1 className={s.h1}>
              Cobrá por todo lo que hacés.<br />
              Dejá de regalar <em>el resto.</em>
            </h1>
            <p className={s.lead}>
              Tu cliente te escribe por Telegram: audios, capturas, ideas sueltas. ScopeProfit
              convierte esa conversación en un alcance de proyecto claro — con requerimientos,
              riesgos y &quot;zonas grises&quot; marcadas — antes de que empieces a construir, no
              cuando ya es tarde para cobrarlo.
            </p>
            <div className={s.ctaRow}>
              <Link className={s.ctaPrimary} href="/login">Crear mi cuenta gratis →</Link>
              <Link className={s.ctaSecondary} href="#como-funciona">Ver cómo funciona</Link>
            </div>
            <p className={s.microcopy}>Sin tarjeta. Usás tu propia cuenta de IA, sin markup. Vos aprobás cada versión antes de que salga.</p>
          </div>

          <div className={s.mock} aria-label="Ejemplo ilustrativo de documento generado por ScopeProfit">
            <div className={s.mockTop}>
              <span className={s.mockDot} style={{ background: '#6d28d9' }} />
              <span>PORTAL DE CLIENTES</span>
              <span className={s.mockTag}>Borrador v0.3</span>
            </div>
            <p className={s.mockQuote}>&quot;Necesito un panel sencillo&quot;</p>
            <p className={s.mockSub}>se convirtió en esto en 12 minutos de chat:</p>
            <div className={s.mockLine}>
              <span className={s.mockIcon} style={{ background: '#eafaf0', color: '#0f8a4c' }}>✓</span>
              <div><strong>8 requerimientos con contexto</strong><p>Roles, permisos, gestión de pedidos, reportes exportables.</p></div>
            </div>
            <div className={s.mockLine}>
              <span className={s.mockIcon} style={{ background: '#fff5da', color: '#8a5a00' }}>?</span>
              <div><strong>3 zonas grises detectadas</strong><p>¿Quién carga los datos iniciales? ¿Hay integración con el ERP actual?</p></div>
            </div>
            <div className={s.mockLine}>
              <span className={s.mockIcon} style={{ background: '#f4ecff', color: '#6d28d9' }}>↗</span>
              <div><strong>Alcance firmable, sin letra chica</strong><p>Incluye, excluye y define criterios de aceptación por cada punto.</p></div>
            </div>
            <div className={s.mockFoot}>
              <span>7 secciones · 1 fuente de verdad</span>
              <span>PDF + Word editable</span>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEMA */}
      <section className={`${s.section} ${s.problem}`}>
        <p className={s.kicker}>ESTO TE SUENA</p>
        <h2>Frases que escuchás (o decís) a mitad de un proyecto</h2>
        <div className={s.problemGrid}>
          <div className={s.problemCard}>
            <p className={s.quote}>&quot;Ah, pensé que eso ya estaba incluido.&quot;</p>
            <p className={s.who}>— el cliente, en la reunión número 4</p>
          </div>
          <div className={s.problemCard}>
            <p className={s.quote}>&quot;¿Y esto quién lo iba a cargar?&quot;</p>
            <p className={s.who}>— vos, dos semanas antes de entregar</p>
          </div>
          <div className={s.problemCard}>
            <p className={s.quote}>&quot;Bueno, lo hago yo esta vez y ya está.&quot;</p>
            <p className={s.who}>— vos, regalando horas otra vez</p>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className={s.section}>
        <p className={s.kicker}>DEL CHAT DESORDENADO AL DOCUMENTO FIRMABLE</p>
        <h2 className={s.h2}>Tres pasos, sin reuniones repetidas</h2>
        <p className={s.sectionLead}>
          No es un formulario más para que tu cliente abandone a la mitad. Es una conversación
          de Telegram, como ya está acostumbrado a tener con vos.
        </p>
        <div className={s.steps}>
          <div className={s.step}>
            <span className={s.stepNum}>1</span>
            <h3>Compartís el link de Telegram</h3>
            <p>Tu cliente cuenta su idea como quiera: texto suelto, fotos de una pizarra, capturas de pantalla. No necesita aprender nada nuevo.</p>
          </div>
          <div className={s.step}>
            <span className={s.stepNum}>2</span>
            <h3>El agente arma el Brief en vivo</h3>
            <p>Organiza requerimientos y pregunta cosas como &quot;¿quién aprueba los cambios de alcance?&quot; antes de que sea tarde — con tu propia cuenta de IA.</p>
          </div>
          <div className={s.step}>
            <span className={s.stepNum}>3</span>
            <h3>Vos revisás y aprobás</h3>
            <p>Editás lo que haga falta y aprobás la versión final desde Telegram. Tu cliente recibe el PDF y el Word, listos para firmar.</p>
          </div>
        </div>
        <Link className={s.ctaPrimary} href="/login">Probar con mi próximo cliente →</Link>
      </section>

      {/* FEATURES */}
      <section className={s.section} style={{ background: '#fff' }}>
        <p className={s.kicker}>LO QUE INCLUYE</p>
        <h2 className={s.h2}>Todo lo que necesitás para no perder plata de nuevo</h2>
        <div className={s.features}>
          <div className={s.feature}>
            <span className={s.emoji}>💬</span>
            <h3>Chat por Telegram</h3>
            <p>Tu cliente no instala nada nuevo. Habla como ya sabe hablar.</p>
          </div>
          <div className={s.feature}>
            <span className={s.emoji}>🧠</span>
            <h3>Detección de zonas grises</h3>
            <p>El agente marca explícitamente lo que falta definir, no lo asume por vos.</p>
          </div>
          <div className={s.feature}>
            <span className={s.emoji}>✍️</span>
            <h3>Edición manual</h3>
            <p>Ajustás cualquier sección del documento antes de aprobarlo. La última palabra es siempre tuya.</p>
          </div>
          <div className={s.feature}>
            <span className={s.emoji}>📄</span>
            <h3>PDF + Word editable</h3>
            <p>Tu cliente recibe ambos formatos, listos para firmar o seguir editando.</p>
          </div>
          <div className={s.feature}>
            <span className={s.emoji}>🔑</span>
            <h3>Tu propia cuenta de IA</h3>
            <p>Usás tu propia clave — sin markup escondido en el precio.</p>
          </div>
          <div className={s.feature}>
            <span className={s.emoji}>🔒</span>
            <h3>Aprobación humana siempre</h3>
            <p>Nada sale a tu cliente sin que vos lo revises y confirmes primero.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`${s.section} ${s.faq}`}>
        <p className={s.kicker}>PREGUNTAS FRECUENTES</p>
        <h2 className={s.h2}>Antes de que preguntes</h2>
        <div className={s.faqList}>
          <details className={s.faqItem}>
            <summary>¿Mi cliente necesita instalar algo?</summary>
            <p>No. Solo necesita Telegram, que ya usa. No hay formularios nuevos ni cuentas que crear de su lado.</p>
          </details>
          <details className={s.faqItem}>
            <summary>¿Qué pasa con mis datos y los de mi cliente?</summary>
            <p>Vos controlás cada aprobación antes de que un documento salga. Nada se comparte con tu cliente sin tu revisión explícita.</p>
          </details>
          <details className={s.faqItem}>
            <summary>¿Necesito pagar por la IA aparte?</summary>
            <p>Usás tu propia cuenta de IA (por ejemplo Gemini), así que pagás directamente el uso real, sin intermediarios ni markup oculto en el precio de ScopeProfit.</p>
          </details>
          <details className={s.faqItem}>
            <summary>¿Puedo editar lo que genera el agente?</summary>
            <p>Sí, todo el documento es editable sección por sección antes de aprobarlo — el agente arma un punto de partida, no la versión final.</p>
          </details>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className={s.section}>
        <div className={s.finalCta}>
          <h2>¿Cuánto trabajo gratis hiciste este año por un alcance mal definido?</h2>
          <p>Armá tu próximo alcance de proyecto en minutos, no en reuniones repetidas.</p>
          <Link className={s.ctaPrimary} href="/login">Crear mi cuenta gratis →</Link>
        </div>
      </section>
    </main>
  );
}
