import Link from 'next/link';
import { VineBackground } from '../components/VineBackground';

export default function Home() {
  return (
    <main className="landing">
      <section className="hero">
        <VineBackground />
        <div className="hero-copy">
          <p className="eyebrow"><span className="dot" /> PARA FREELANCERS Y AGENCIAS DE SOFTWARE</p>
          <h1>
            Dejá de perder plata<br />
            en el trabajo que <em>nadie cotizó.</em>
          </h1>
          <p className="hero-description">
            Tu cliente te manda audios, capturas y mensajes sueltos por Telegram. ScopeProfit
            los convierte en un alcance de proyecto con requerimientos, riesgos y &quot;zonas grises&quot;
            marcadas — antes de que firmes, no cuando ya estás a mitad de camino.
          </p>
          <div className="actions">
            <Link className="button" href="/login">Crear mi cuenta gratis <span aria-hidden>↗</span></Link>
            <Link className="text-link" href="#como-funciona">Ver cómo funciona <span aria-hidden>↓</span></Link>
          </div>
          <p className="small muted">Sin tarjeta. Usás tu propia cuenta de IA, sin markup. Vos aprobás cada versión antes de que salga.</p>
        </div>
        <div className="hero-preview" aria-label="Ejemplo ilustrativo de documento generado por ScopeProfit">
          <div className="preview-top">
            <span className="mini-logo">SP</span>
            <span>PORTAL DE CLIENTES</span>
            <span className="tag">Borrador v0.3</span>
          </div>
          <h2>&quot;Necesito un panel sencillo&quot;</h2>
          <p className="muted">se convirtió en esto en 12 minutos de chat:</p>
          <div className="preview-line">
            <span className="check">✓</span>
            <div><strong>8 requerimientos con contexto</strong><p>Roles, permisos, gestión de pedidos, reportes exportables.</p></div>
          </div>
          <div className="preview-line">
            <span className="warning">?</span>
            <div><strong>3 zonas grises detectadas</strong><p>¿Quién carga los datos iniciales? ¿Hay integración con el ERP actual?</p></div>
          </div>
          <div className="preview-line">
            <span className="check">↗</span>
            <div><strong>Alcance firmable, sin letra chica</strong><p>Incluye, excluye y define criterios de aceptación por cada punto.</p></div>
          </div>
          <div className="preview-bottom">
            <span>7 secciones · 1 fuente de verdad</span>
            <span>PDF + Word editable</span>
          </div>
        </div>
      </section>

      <section className="social-proof" aria-label="Por qué importa">
        <p>El síntoma es siempre el mismo: &quot;pensé que eso estaba incluido&quot;. Y para cuando lo decís en voz alta, ya lo hiciste gratis.</p>
      </section>

      <section id="como-funciona" className="how">
        <div className="section-heading">
          <p className="eyebrow">DEL CHAT DESORDENADO AL DOCUMENTO FIRMABLE</p>
          <h2>Cómo definir el alcance de un proyecto freelance en 3 pasos</h2>
        </div>
        <div className="steps">
          <article>
            <span className="step-number">01</span>
            <h3>Compartís el link de Telegram</h3>
            <p>Tu cliente cuenta su idea como quiera: texto suelto, fotos de una pizarra, capturas de pantalla. No necesita aprender nada nuevo.</p>
          </article>
          <article>
            <span className="step-number">02</span>
            <h3>El agente arma el Brief en vivo</h3>
            <p>Organiza requerimientos y pregunta cosas como &quot;¿quién aprueba los cambios de alcance?&quot; antes de que sea tarde — con tu propia cuenta de IA, sin costos ocultos.</p>
          </article>
          <article>
            <span className="step-number">03</span>
            <h3>Vos revisás y aprobás</h3>
            <p>Editás lo que haga falta y aprobás la versión final desde Telegram. Tu cliente recibe el PDF y el Word, listos para firmar.</p>
          </article>
        </div>
      </section>

      <section className="landing-cta">
        <div>
          <p className="eyebrow">ANTES DE TU PRÓXIMA PROPUESTA</p>
          <h2>¿Cuánto trabajo gratis hiciste este año por un alcance mal definido?</h2>
          <p>20 preguntas para encontrar el trabajo que todavía no estás viendo — gratis, sin registro.</p>
        </div>
        <Link href="/checklist" className="button secondary">Hacer el checklist gratuito →</Link>
      </section>
    </main>
  );
}
