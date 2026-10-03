'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, FileText, Send, X } from 'lucide-react';
import type { Quote, QuoteLine, QuoteMilestone } from '@scopeprofit/contracts';
import { api, ApiError, downloadFile, errorMessage } from '@/lib/api';
import { money, quoteStatusLabels, quoteStatusTone, shortDate } from '@/lib/project';

export type LoadedQuote = Quote & { lines: QuoteLine[]; milestones: QuoteMilestone[] };

type MilestoneMode = 'percent' | 'amount';
type Decision = 'accepted' | 'rejected';

interface LineDraft {
  module: string;
  minHours: string;
  maxHours: string;
}
interface MilestoneDraft {
  name: string;
  percent: string;
  amount: string;
}

const toIsoDate = (value: string) => (value ? `${value}T00:00:00.000Z` : null);

export function QuotePanel({
  projectId,
  professional,
  token,
}: {
  projectId: string;
  professional: boolean;
  token?: string;
}) {
  const [quote, setQuote] = useState<LoadedQuote | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [terms, setTerms] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [mode, setMode] = useState<MilestoneMode>('percent');

  const load = useCallback(
    () =>
      api<LoadedQuote>(`/projects/${projectId}/quote`, {}, token)
        .then(
          (data) => {
            setQuote(data);
            setMissing(false);
            setError('');
          },
          (e: unknown) => {
            if (e instanceof ApiError && e.status === 404) {
              setQuote(null);
              setMissing(true);
              setError('');
            } else setError(errorMessage(e));
          },
        )
        .finally(() => setLoading(false)),
    [projectId, token],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setError('');
    try {
      await api(`/projects/${projectId}/quote/generate`, { method: 'POST', body: '{}' }, token);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function startEdit() {
    if (!quote) return;
    setTerms(quote.terms ?? '');
    setValidUntil(quote.validUntil ? quote.validUntil.slice(0, 10) : '');
    setLines(
      quote.lines.map((line) => ({
        module: line.module,
        minHours: String(line.minHours),
        maxHours: String(line.maxHours),
      })),
    );
    setMilestones(
      quote.milestones.map((milestone) => ({
        name: milestone.name,
        percent: milestone.percent === null ? '' : String(milestone.percent),
        amount: milestone.amount === null ? '' : String(milestone.amount),
      })),
    );
    setMode(
      quote.milestones.length && quote.milestones.every((milestone) => milestone.amount !== null)
        ? 'amount'
        : 'percent',
    );
    setEditing(true);
    setError('');
  }
  function validate(): string | null {
    if (!lines.length) return 'La cotización necesita al menos una línea.';
    if (lines.some((line) => !line.module.trim())) return 'Cargá el nombre de cada módulo.';
    if (
      lines.some((line) => {
        const min = Number(line.minHours);
        const max = Number(line.maxHours);
        return !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min;
      })
    )
      return 'Revisá las horas: el máximo no puede ser menor al mínimo.';
    if (milestones.some((milestone) => !milestone.name.trim()))
      return 'Cargá un nombre para cada hito.';
    if (mode === 'percent') {
      const total = milestones.reduce(
        (sum, milestone) =>
          Number.isFinite(Number(milestone.percent)) ? sum + Number(milestone.percent) : sum,
        0,
      );
      if (milestones.length && total !== 100)
        return 'Los hitos en porcentaje deben sumar exactamente 100%.';
      if (milestones.some((milestone) => !Number.isInteger(Number(milestone.percent))))
        return 'Cada hito necesita un porcentaje entero.';
    } else if (milestones.some((milestone) => Number(milestone.amount) <= 0))
      return 'Los hitos con monto deben ser mayores a cero.';
    return null;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!quote) return;
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await api<LoadedQuote>(
        `/projects/${projectId}/quote`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            terms,
            validUntil: toIsoDate(validUntil),
            lines: lines.map((line) => ({
              module: line.module.trim(),
              minHours: Number(line.minHours),
              maxHours: Number(line.maxHours),
            })),
            milestones: milestones.map((milestone) =>
              mode === 'percent'
                ? { name: milestone.name.trim(), percent: Number(milestone.percent) }
                : { name: milestone.name.trim(), amount: Number(milestone.amount) },
            ),
          }),
        },
        token,
      );
      setQuote(updated);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!confirm('¿Enviar la propuesta al cliente? Después de enviarla no se puede editar.'))
      return;
    setBusy(true);
    setError('');
    try {
      const sent = await api<LoadedQuote>(
        `/projects/${projectId}/quote/send`,
        { method: 'POST', body: '{}' },
        token,
      );
      setQuote(sent);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: Decision) {
    const question =
      decision === 'accepted'
        ? '¿Aceptar esta propuesta?'
        : '¿Rechazar esta propuesta? Esta acción no se puede deshacer.';
    if (!confirm(question)) return;
    setBusy(true);
    setError('');
    try {
      const decided = await api<LoadedQuote>(
        `/projects/${projectId}/quote/decision`,
        { method: 'POST', body: JSON.stringify({ decision }) },
        token,
      );
      setQuote(decided);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function download(format: 'pdf' | 'docx') {
    setError('');
    try {
      await downloadFile(
        `/projects/${projectId}/quote/${format}`,
        `cotizacion-${projectId}.${format}`,
        token,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const canEdit = professional && quote?.status === 'draft';
  const canDecide = !professional && !!token && quote?.status === 'sent';
  const showRate = professional;

  return (
    <section className="quote-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PROPUESTA COMERCIAL</p>
          <h2>Cotización</h2>
        </div>
        {quote && (
          <span className={`tag ${quoteStatusTone[quote.status]}`}>
            {quoteStatusLabels[quote.status]}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando cotización…</p>
      ) : missing ? (
        <div className="empty-state">
          <span className="empty-icon">
            <FileText size={26} aria-hidden />
          </span>
          <h3>Todavía no hay cotización.</h3>
          <p>
            {professional
              ? 'Generá la propuesta a partir de las estimaciones de horas del Brief.'
              : 'Tu profesional todavía no envió la propuesta. Cuando la envíe vas a poder aceptarla o rechazarla acá.'}
          </p>
          {professional && (
            <button className="button" disabled={busy} onClick={() => void generate()}>
              {busy ? 'Generando…' : 'Generar desde Brief'}
            </button>
          )}
        </div>
      ) : quote ? (
        <div className="quote-body">
          <div className="quote-meta small muted">
            {quote.validUntil && <span>Válida hasta {shortDate(quote.validUntil)}</span>}
            {quote.sentAt && <span>Enviada el {shortDate(quote.sentAt)}</span>}
            {quote.decidedAt && <span>Respondida el {shortDate(quote.decidedAt)}</span>}
            {!quote.sentAt && <span>Creada el {shortDate(quote.createdAt)}</span>}
          </div>
          {quote.status === 'accepted' && (
            <p role="status" className="success">
              {professional
                ? 'El cliente aceptó esta propuesta.'
                : 'Aceptaste esta propuesta. Ya queda registrada.'}
            </p>
          )}
          {quote.status === 'rejected' && (
            <div role="alert" className="error">
              {professional
                ? 'El cliente rechazó esta propuesta. Podés ajustar el alcance y enviar una nueva.'
                : 'Rechazaste esta propuesta. Queda registrada; podés consultarla con tu profesional.'}
            </div>
          )}
          {canDecide && (
            <div className="notice">
              Revisá el rango de inversión, los hitos y la validez antes de responder. Esta
              respuesta queda registrada.
            </div>
          )}
          {!editing && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th>Horas</th>
                    {showRate && <th>Tarifa</th>}
                    <th>Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.module}</td>
                      <td>
                        {line.minHours}–{line.maxHours} h
                      </td>
                      {showRate && <td>{money(line.hourlyRate, quote.currency)}</td>}
                      <td>
                        {money(line.priceMin, quote.currency)} –{' '}
                        {money(line.priceMax, quote.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Total</th>
                    <td>
                      {quote.lines.reduce((sum, line) => sum + line.minHours, 0)}–
                      {quote.lines.reduce((sum, line) => sum + line.maxHours, 0)} h
                    </td>
                    {showRate && <td />}
                    <td>
                      <strong>
                        {money(quote.totalMin, quote.currency)} –{' '}
                        {money(quote.totalMax, quote.currency)}
                      </strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {!editing && quote.milestones.length > 0 && (
            <div className="quote-milestones">
              <h3>Hitos de pago</h3>
              <ul>
                {quote.milestones.map((milestone, index) => (
                  <li key={milestone.id}>
                    <span>
                      {index + 1}. {milestone.name}
                    </span>
                    <strong>
                      {milestone.percent !== null
                        ? `${milestone.percent}%`
                        : money(milestone.amount ?? 0, quote.currency)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!editing && quote.terms && (
            <div className="quote-terms">
              <h3>Términos y condiciones</h3>
              <p className="preserve small">{quote.terms}</p>
            </div>
          )}
          {!editing && (
            <div className="quote-actions">
              <button className="download-button" onClick={() => void download('pdf')}>
                PDF ↓
              </button>
              <button className="download-button" onClick={() => void download('docx')}>
                DOCX ↓
              </button>
            </div>
          )}
          {canEdit && !editing && (
            <div className="quote-actions">
              <button className="button" onClick={startEdit}>
                Editar cotización
              </button>
              <button className="button secondary" disabled={busy} onClick={() => void send()}>
                <Send size={16} aria-hidden /> {busy ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          )}
          {canDecide && (
            <div className="quote-actions">
              <button className="button" disabled={busy} onClick={() => void decide('accepted')}>
                <Check size={16} aria-hidden /> Aceptar propuesta
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void decide('rejected')}
              >
                <X size={16} aria-hidden /> Rechazar
              </button>
            </div>
          )}
          {canEdit && editing && (
            <form className="quote-editor" onSubmit={save}>
              <label htmlFor="quote-terms">Términos y condiciones</label>
              <textarea
                id="quote-terms"
                rows={4}
                maxLength={10000}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Forma de pago, alcance de soporte, condiciones de entrega…"
              />
              <label htmlFor="quote-valid-until">Válida hasta</label>
              <input
                id="quote-valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
              <h3>Líneas de trabajo</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Módulo</th>
                      <th>Horas mín.</th>
                      <th>Horas máx.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            aria-label={`Módulo ${index + 1}`}
                            maxLength={200}
                            value={line.module}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, module: e.target.value } : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Horas mínimas del módulo ${index + 1}`}
                            type="number"
                            min={0}
                            step={1}
                            value={line.minHours}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, minHours: e.target.value } : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Horas máximas del módulo ${index + 1}`}
                            type="number"
                            min={0}
                            step={1}
                            value={line.maxHours}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, maxHours: e.target.value } : item,
                                ),
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="quote-actions">
                <h3>Hitos de pago</h3>
                <label className="sr-only" htmlFor="milestone-mode">
                  Tipo de hito
                </label>
                <select
                  id="milestone-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value === 'amount' ? 'amount' : 'percent')}
                >
                  <option value="percent">Porcentaje</option>
                  <option value="amount">Monto fijo</option>
                </select>
                <button
                  type="button"
                  className="download-button"
                  onClick={() =>
                    setMilestones((prev) => [...prev, { name: '', percent: '', amount: '' }])
                  }
                >
                  ＋ Agregar hito
                </button>
              </div>
              {milestones.length === 0 && (
                <p className="small muted">
                  Sin hitos de pago. Podés agregarlos si el cobro es por etapas.
                </p>
              )}
              {milestones.map((milestone, index) => (
                <div className="milestone-row" key={index}>
                  <input
                    aria-label={`Nombre del hito ${index + 1}`}
                    maxLength={500}
                    placeholder="Nombre del hito"
                    value={milestone.name}
                    onChange={(e) =>
                      setMilestones((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, name: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={
                      mode === 'percent'
                        ? `Porcentaje del hito ${index + 1}`
                        : `Monto del hito ${index + 1}`
                    }
                    type="number"
                    min={0}
                    max={mode === 'percent' ? 100 : undefined}
                    step={mode === 'percent' ? 1 : 0.01}
                    placeholder={mode === 'percent' ? '%' : quote.currency}
                    value={mode === 'percent' ? milestone.percent : milestone.amount}
                    onChange={(e) =>
                      setMilestones((prev) =>
                        prev.map((item, i) =>
                          i === index
                            ? mode === 'percent'
                              ? { ...item, percent: e.target.value }
                              : { ...item, amount: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="quiet"
                    aria-label={`Quitar hito ${index + 1}`}
                    onClick={() => setMilestones((prev) => prev.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="quote-actions sticky-actions">
                <button className="button" type="submit" disabled={busy}>
                  {busy ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No pudimos cargar la cotización.</h3>
          <button
            className="button secondary"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            Reintentar
          </button>
        </div>
      )}
    </section>
  );
}
