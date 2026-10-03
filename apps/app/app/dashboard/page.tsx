'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MaintenanceSummary, Page, Project, QuoteSummary, User } from '@scopeprofit/contracts';
import { api, ApiError, errorMessage } from '@/lib/api';
import {
  maintenanceStatusLabels,
  maintenanceStatusTone,
  money,
  quoteStatusLabels,
  quoteStatusTone,
  shortDate,
  statusLabels,
} from '@/lib/project';
export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuoteSummary[] | null>(null);
  const [quotesError, setQuotesError] = useState('');
  const [agreements, setAgreements] = useState<MaintenanceSummary[] | null>(null);
  const [agreementsError, setAgreementsError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([api<User>('/auth/me'), api<Page<Project>>('/projects')])
      .then(([u, p]) => {
        if (active) {
          setUser(u);
          setProjects(p.items);
          setCursor(p.nextCursor);
        }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/login');
        else if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);
  useEffect(() => {
    if (user?.role !== 'professional') return;
    let active = true;
    api<{ quotes: QuoteSummary[] }>('/me/quotes')
      .then((result) => {
        if (active) setQuotes(result.quotes);
      })
      .catch((e) => {
        if (!active || (e instanceof ApiError && e.status === 401)) return;
        setQuotes([]);
        setQuotesError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    if (user?.role !== 'professional') return;
    let active = true;
    api<{ agreements: MaintenanceSummary[] }>('/me/maintenance')
      .then((result) => {
        if (active) setAgreements(result.agreements);
      })
      .catch((e) => {
        if (!active || (e instanceof ApiError && e.status === 401)) return;
        setAgreements([]);
        setAgreementsError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [user]);
  async function more() {
    try {
      const page = await api<Page<Project>>(`/projects?cursor=${encodeURIComponent(cursor!)}`);
      setProjects((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      router.replace('/login');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <main className="page wide">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU ESPACIO</p>
          <h1>Proyectos con dirección.</h1>
          <p className="muted">
            Todo el contexto, desde la primera idea hasta el alcance aprobado.
          </p>
        </div>
        <div className="actions">
          {user?.role === 'professional' && (
            <Link className="button secondary" href="/settings">
              Configurar IA
            </Link>
          )}
          <button className="quiet" onClick={logout}>
            Salir
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando proyectos…</p>
      ) : (
        <>
          {user?.role === 'professional' && !user.hasAiApiKey && (
            <div className="notice">
              Configurá tu clave de Gemini para que el agente pueda trabajar en tus proyectos.{' '}
              <Link href="/settings">Configurar ahora →</Link>
            </div>
          )}
          <div className="project-grid">
            {projects.map((p) => (
              <Link className="project-card" href={`/p/${p.id}`} key={p.id}>
                <span className="tag">{statusLabels[p.status]}</span>
                <h2>{p.name}</h2>
                <p>{p.clientEmail ?? 'Relevamiento en curso'}</p>
                <span className="small muted">
                  Actualizado {new Date(p.updatedAt).toLocaleDateString('es-AR')}
                </span>
                <span className="project-arrow" aria-hidden>
                  ↗
                </span>
              </Link>
            ))}
          </div>
          {projects.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">↗</span>
              <h2>El próximo gran proyecto empieza acá.</h2>
              <p>
                {user?.role === 'professional'
                  ? 'Abrí el bot de Telegram y enviá /createproject seguido del nombre. Compartí el enlace con tu cliente y dejá que las ideas empiecen a tomar forma.'
                  : 'Todavía no tenés proyectos. Abrí el enlace que te compartió tu profesional para empezar.'}
              </p>
            </div>
          )}
          {cursor && (
            <button className="button secondary" onClick={more}>
              Cargar más proyectos
            </button>
          )}
          {user?.role === 'professional' && (
            <section className="panel space-top" aria-label="Cotizaciones">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">PROPUESTAS</p>
                  <h2>Cotizaciones</h2>
                </div>
              </div>
              {quotesError && (
                <p role="alert" className="error">
                  {quotesError}
                </p>
              )}
              {quotes === null ? (
                <p role="status">Cargando cotizaciones…</p>
              ) : quotes.length === 0 && !quotesError ? (
                <p className="muted">
                  Todavía no hay cotizaciones. Abrí un proyecto con Brief cargado y generá la
                  propuesta desde su panel de Cotización.
                </p>
              ) : (
                <ul className="quote-list">
                  {quotes.map((quote) => (
                    <li key={quote.id}>
                      <Link className="quote-row" href={`/p/${quote.projectId}`}>
                        <span className={`tag ${quoteStatusTone[quote.status]}`}>
                          {quoteStatusLabels[quote.status]}
                        </span>
                        <strong>{quote.projectName}</strong>
                        <span className="small muted">{shortDate(quote.updatedAt)}</span>
                        <span className="quote-total">
                          {money(quote.totalMin, quote.currency)} –{' '}
                          {money(quote.totalMax, quote.currency)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {user?.role === 'professional' && (
            <section className="panel space-top" aria-label="Mantenimiento">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">RETAINERS</p>
                  <h2>Mantenimiento</h2>
                </div>
              </div>
              {agreementsError && (
                <p role="alert" className="error">
                  {agreementsError}
                </p>
              )}
              {agreements === null ? (
                <p role="status">Cargando mantenimiento…</p>
              ) : agreements.length === 0 && !agreementsError ? (
                <p className="muted">
                  Todavía no hay retainers. Abrí un proyecto y creá el retainer desde su panel de
                  Mantenimiento.
                </p>
              ) : (
                <ul className="maintenance-list">
                  {agreements.map((agreement) => (
                    <li key={agreement.id}>
                      <Link className="maintenance-row" href={`/p/${agreement.projectId}`}>
                        <span className={`tag ${maintenanceStatusTone[agreement.status]}`}>
                          {maintenanceStatusLabels[agreement.status]}
                        </span>
                        <strong>{agreement.projectName}</strong>
                        <span className="small muted">
                          {agreement.hoursPerMonth} h/mes · {shortDate(agreement.startDate)}
                        </span>
                        <span className="maintenance-total">
                          {agreement.monthlyPrice === null
                            ? 'Sin precio'
                            : money(agreement.monthlyPrice, agreement.currency)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
