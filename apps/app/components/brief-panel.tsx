'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Brief, BriefData, DocumentVersion, TiptapNode, DiffKind } from '@scopeprofit/contracts';
import { api, errorMessage } from '@/lib/api';
import { documentText, textDocument } from '@/lib/project';
import { RichEditor } from './rich-editor';

type ChangeRequestHistory = {
  action: string;
  result: string;
  actorId: string | null;
  actorEmail: string | null;
  createdAt: string;
};

type ChangeRequest = {
  id: string;
  request: string;
  classification: 'in_scope' | 'out_of_scope' | 'ambiguous';
  status: 'proposed' | 'applying' | 'accepted' | 'rejected';
  baseBriefVersion: number;
  patch: Partial<BriefData> | null;
  decisionBy: string | null;
  decisionAt: string | null;
  appliedBriefVersion: number | null;
  documentVersion: number | null;
  lastError: string | null;
  history: ChangeRequestHistory[];
};

type DiffEntry = {
  key: string;
  kind: DiffKind;
  before?: unknown;
  after?: unknown;
};
const editableSections = [
  ['summary', 'Resumen ejecutivo'],
  ['included', 'Incluidos'],
  ['excluded', 'Excluidos'],
  ['assumptions', 'Supuestos'],
  ['acceptanceCriteria', 'Criterios de aceptación'],
  ['nextSteps', 'Próximos pasos'],
] as const;
export function BriefPanel({
  projectId,
  brief,
  document,
  professional,
  token,
  locked,
  onSaved,
}: {
  projectId: string;
  brief?: Brief;
  document?: DocumentVersion | null;
  professional: boolean;
  token?: string;
  locked: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BriefData | null>(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const [editorContent, setEditorContent] = useState<TiptapNode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [diff, setDiff] = useState<DiffEntry[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [editingRequest, setEditingRequest] = useState<string | null>(null);
  const [patchText, setPatchText] = useState('{}');
  const [requestBusy, setRequestBusy] = useState(false);
  const loadChangeRequests = useCallback(async () => {
    try {
      const result = await api<ChangeRequest[]>(`/projects/${projectId}/change-requests`);
      setRequests(result);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [projectId]);
  useEffect(() => {
    if (!professional) return;
    let active = true;
    async function load() {
      try {
        const result = await api<ChangeRequest[]>(`/projects/${projectId}/change-requests`);
        if (active) setRequests(result);
      } catch (e: unknown) {
        if (active) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [projectId, professional]);
  function edit() {
    if (!brief) return;
    setDraft(structuredClone(brief.data));
    setBaseVersion(brief.version);
    setEditorContent(professional ? (document?.editorContent ?? null) : null);
    setEditing(true);
    setError('');
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      if (professional && editorContent && document) {
        await api(
          `/projects/${projectId}/documents/current`,
          {
            method: 'PATCH',
            body: JSON.stringify({ expectedVersion: document.version, editorContent }),
          },
          token,
        );
      } else {
        await api(
          `/projects/${projectId}/brief`,
          { method: 'PATCH', body: JSON.stringify({ expectedVersion: baseVersion, data: draft }) },
          token,
        );
      }
      setEditing(false);
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function showDiff() {
    if (!brief || brief.version < 2) return;
    try {
      const result = await api<{ changes: DiffEntry[] }>(
        `/projects/${projectId}/brief/diff?from=${brief.version - 1}&to=${brief.version}`,
        {},
        token,
      );
      setDiff(result.changes);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function savePatch(change: ChangeRequest) {
    setRequestBusy(true);
    setError('');
    try {
      const patch: unknown = JSON.parse(patchText);
      if (!patch || Array.isArray(patch))
        throw new Error('El patch debe ser un objeto JSON con campos del Brief.');
      await api(`/projects/${projectId}/change-requests/${change.id}/proposal`, {
        method: 'PATCH',
        body: JSON.stringify({ baseBriefVersion: change.baseBriefVersion, patch }),
      });
      setEditingRequest(null);
      await loadChangeRequests();
    } catch (e) {
      setError(e instanceof SyntaxError ? 'El patch no es JSON válido.' : errorMessage(e));
    } finally {
      setRequestBusy(false);
    }
  }
  async function decide(change: ChangeRequest, status: 'accepted' | 'rejected') {
    setRequestBusy(true);
    setError('');
    try {
      await api(`/projects/${projectId}/change-requests/${change.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await Promise.all([loadChangeRequests(), onSaved()]);
    } catch (e) {
      setError(errorMessage(e));
      await loadChangeRequests();
    } finally {
      setRequestBusy(false);
    }
  }
  const data = brief?.data;
  return (
    <section className="brief-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">DOCUMENTO VIVO</p>
          <h2>Brief del proyecto</h2>
        </div>
        <span className="tag">v{brief?.version ?? 0}</span>
      </div>
      {brief && brief.version > 1 && (
        <button className="button secondary" onClick={showDiff}>
          Ver cambios de v{brief.version - 1} a v{brief.version}
        </button>
      )}
      {diff.length > 0 && (
        <div className="notice" aria-live="polite">
          <strong>Cambios de alcance</strong>
          <ul>
            {diff.map((change) => (
              <li key={`${change.kind}-${change.key}`}>
                <strong>
                  {change.kind === ('added' satisfies DiffKind)
                    ? 'Agregado'
                    : change.kind === ('removed' satisfies DiffKind)
                      ? 'Quitado'
                      : 'Modificado'}
                </strong>
                : {change.key}
                {change.kind !== ('added' satisfies DiffKind) && (
                  <div className="diff-value">
                    <span>Antes</span>
                    <pre>{formatValue(change.before)}</pre>
                  </div>
                )}
                {change.kind !== ('removed' satisfies DiffKind) && (
                  <div className="diff-value">
                    <span>Después</span>
                    <pre>{formatValue(change.after)}</pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {professional && (
        <section className="change-requests" aria-labelledby="change-requests-title">
          <h3 id="change-requests-title">Solicitudes de cambio</h3>
          {requests.length ? (
            requests.map((change) => (
              <article className="change-request" key={change.id}>
                <div className="panel-heading">
                  <strong>{change.request}</strong>
                  <span className={`tag ${change.status === 'applying' ? 'amber' : ''}`}>
                    {statusLabel(change.status)}
                  </span>
                </div>
                <p className="small muted">
                  Clasificación: {classificationLabel(change.classification)} · Brief base v
                  {change.baseBriefVersion}
                  {change.appliedBriefVersion
                    ? ` · Brief aplicado v${change.appliedBriefVersion}`
                    : ''}
                  {change.documentVersion ? ` · Documento v${change.documentVersion}` : ''}
                </p>
                {change.lastError && (
                  <p className="notice" role="status">
                    No se confirmó la aplicación ({change.lastError}). El cambio quedó guardado;
                    reintentá aceptar para completar la generación del documento.
                  </p>
                )}
                {change.patch && (
                  <div className="patch-preview">
                    <strong>Patch revisado</strong>
                    <ul>
                      {Object.entries(change.patch).map(([key, value]) => (
                        <li key={key}>
                          <strong>{key}</strong>
                          <div className="diff-value">
                            <span>Antes · v{change.baseBriefVersion}</span>
                            <pre>{formatValue(brief?.data[key as keyof BriefData])}</pre>
                          </div>
                          <div className="diff-value">
                            <span>Propuesta</span>
                            <pre>{formatValue(value)}</pre>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {change.status === 'proposed' && (
                  <div className="actions change-actions">
                    <button
                      className="button secondary"
                      onClick={() => {
                        setEditingRequest(editingRequest === change.id ? null : change.id);
                        setPatchText(JSON.stringify(change.patch ?? {}, null, 2));
                        setError('');
                      }}
                    >
                      {change.patch ? 'Revisar patch' : 'Preparar patch'}
                    </button>
                    <button
                      className="button"
                      disabled={requestBusy || !change.patch}
                      onClick={() => void decide(change, 'accepted')}
                    >
                      Aceptar y aplicar
                    </button>
                    <button
                      className="button secondary"
                      disabled={requestBusy}
                      onClick={() => void decide(change, 'rejected')}
                    >
                      Rechazar
                    </button>
                  </div>
                )}
                {change.status === 'applying' && (
                  <button
                    className="button"
                    disabled={requestBusy}
                    onClick={() => void decide(change, 'accepted')}
                  >
                    Reintentar aceptación
                  </button>
                )}
                {editingRequest === change.id && change.status === 'proposed' && (
                  <div className="patch-editor">
                    <label htmlFor={`patch-${change.id}`}>
                      Patch JSON explícito — solo campos del Brief; las listas reemplazan la lista
                      completa.
                    </label>
                    <textarea
                      id={`patch-${change.id}`}
                      rows={8}
                      spellCheck={false}
                      value={patchText}
                      onChange={(event) => setPatchText(event.target.value)}
                    />
                    <div className="actions">
                      <button
                        className="button"
                        disabled={requestBusy}
                        onClick={() => void savePatch(change)}
                      >
                        Guardar patch para revisión
                      </button>
                      <button
                        className="button secondary"
                        disabled={requestBusy}
                        onClick={() => setEditingRequest(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                <details className="change-history">
                  <summary>Historial de decisiones ({change.history.length})</summary>
                  <ol>
                    {change.history.map((event, index) => (
                      <li key={`${event.action}-${event.createdAt}-${index}`}>
                        {historyLabel(event.action)} ·{' '}
                        {event.result === 'failed' ? 'falló' : 'registrado'} ·{' '}
                        {event.actorEmail ?? event.actorId ?? 'Sistema'} ·{' '}
                        {new Date(event.createdAt).toLocaleString('es-AR')}
                      </li>
                    ))}
                  </ol>
                  {change.decisionAt && (
                    <p className="small muted">
                      Decisión actual por {change.decisionBy ?? 'profesional'} ·{' '}
                      {new Date(change.decisionAt).toLocaleString('es-AR')}
                    </p>
                  )}
                </details>
              </article>
            ))
          ) : (
            <p className="small muted">Todavía no hay solicitudes de cambio.</p>
          )}
        </section>
      )}
      <p className="small muted">
        Borrador de trabajo. La aprobación final corresponde al profesional.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {editing && draft ? (
        <>
          <div className="notice">
            {professional
              ? 'Podés editar todo el documento.'
              : 'Editá el resumen, el alcance y los próximos pasos. Para cambiar requisitos o estimaciones, escribí por el chat.'}{' '}
            Tu edición se conserva si hay un conflicto.
          </div>
          {professional && editorContent ? (
            <RichEditor
              content={editorContent}
              onChange={setEditorContent}
              full
              label="Documento completo"
            />
          ) : (
            editableSections.map(([key, label]) => (
              <div className="edit-section" key={key}>
                <h3>{label}</h3>
                <RichEditor
                  label={label}
                  content={textDocument(
                    key === 'summary' ? draft.summary : (draft[key] as string[]).join('\n'),
                  )}
                  onChange={(node) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            [key]:
                              key === 'summary'
                                ? documentText(node)
                                : documentText(node)
                                    .split('\n')
                                    .filter((line) => line.trim()),
                          }
                        : prev,
                    )
                  }
                />
              </div>
            ))
          )}
          <div className="actions sticky-actions">
            <button className="button" disabled={busy} onClick={save}>
              {busy ? 'Guardando…' : 'Guardar nueva versión'}
            </button>
            <button className="button secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : data ? (
        <div className="brief-sections">
          <section>
            <h3>
              <span>01</span> Resumen ejecutivo
            </h3>
            <p className="preserve">
              {data.summary || 'El resumen se construirá con la conversación.'}
            </p>
          </section>
          <section>
            <h3>
              <span>02</span> Requerimientos identificados
            </h3>
            {data.requirements.length ? (
              data.requirements.map((r) => (
                <article className="requirement" key={r.id}>
                  <strong>
                    {r.id} · {r.description}
                  </strong>
                  <p className="small">
                    {r.priority === 'must' ? 'Imprescindible' : 'Deseable'} · {r.systemNote}
                  </p>
                  <blockquote>“{r.source}”</blockquote>
                </article>
              ))
            ) : (
              <p className="muted">Todavía no hay requisitos confirmados.</p>
            )}
          </section>
          <section>
            <h3>
              <span>03</span> Preguntas pendientes
            </h3>
            {data.questions.length ? (
              data.questions.map((q) => (
                <article className="question" key={q.id}>
                  <strong>{q.question}</strong>
                  <p>{q.reason}</p>
                  {q.blocksEstimate && <span className="tag amber">Bloquea estimación</span>}
                </article>
              ))
            ) : (
              <p className="muted">Sin preguntas pendientes.</p>
            )}
          </section>
          <section>
            <h3>
              <span>04</span> Riesgos y ambigüedades
            </h3>
            {data.risks.length ? (
              data.risks.map((r) => (
                <article className={`risk ${r.severity}`} key={r.id}>
                  <strong>
                    {r.severity === 'red'
                      ? 'Alto'
                      : r.severity === 'yellow'
                        ? 'Atención'
                        : 'Controlado'}{' '}
                    · {r.description}
                  </strong>
                  <p>{r.impact}</p>
                  <p className="small">{r.mitigation || 'Falta definir una mitigación.'}</p>
                </article>
              ))
            ) : (
              <p className="muted">El análisis aún no identificó riesgos.</p>
            )}
          </section>
          <section>
            <h3>
              <span>05</span> Alcance
            </h3>
            {editableSections.slice(1, 5).map(([key, label]) => (
              <div key={key}>
                <h4>{label}</h4>
                <List items={data[key] as string[]} />
              </div>
            ))}
          </section>
          <section>
            <h3>
              <span>06</span> Estimación orientativa
            </h3>
            {data.estimates.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Módulo</th>
                      <th>Horas</th>
                      <th>Incertidumbre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.estimates.map((e, i) => (
                      <tr key={i}>
                        <td>{e.module}</td>
                        <td>
                          {e.minHours}–{e.maxHours}
                        </td>
                        <td>{e.uncertainty}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <td>
                        {data.estimates.reduce((n, e) => n + e.minHours, 0)}–
                        {data.estimates.reduce((n, e) => n + e.maxHours, 0)}
                      </td>
                      <td>horas</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="muted">Se estimará cuando haya contexto suficiente.</p>
            )}
            <p className="small muted">
              Rango orientativo, no precio final ni compromiso de entrega.
            </p>
          </section>
          <section>
            <h3>
              <span>07</span> Próximos pasos
            </h3>
            <List items={data.nextSteps} />
          </section>
          {!locked && (
            <button className="button secondary full" onClick={edit}>
              Editar {professional ? 'documento' : 'secciones habilitadas'} ↗
            </button>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <h3>Las buenas preguntas vienen primero.</h3>
          <p>Contá qué necesitás en el chat. Acá irá tomando forma el Brief.</p>
        </div>
      )}
    </section>
  );
}
function List({ items }: { items: string[] }) {
  return items.length ? (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="muted">Por definir.</p>
  );
}
function formatValue(value: unknown) {
  if (value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
function statusLabel(status: ChangeRequest['status']) {
  return (
    {
      proposed: 'Pendiente',
      applying: 'Aplicando · requiere verificación',
      accepted: 'Aceptada',
      rejected: 'Rechazada',
    }[status] ?? status
  );
}
function classificationLabel(classification: ChangeRequest['classification']) {
  return (
    {
      in_scope: 'Dentro del alcance',
      out_of_scope: 'Fuera del alcance',
      ambiguous: 'Ambigua',
    }[classification] ?? classification
  );
}
function historyLabel(action: string) {
  return (
    {
      'change_request.created': 'Solicitud registrada',
      'change_request.accepting': 'Aplicación / intento de aceptación',
      'change_request.accepted': 'Aceptación completada',
      'change_request.rejected': 'Solicitud rechazada',
    }[action] ?? action
  );
}
