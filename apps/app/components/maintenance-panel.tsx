'use client';
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Pause, Play, Plus, Settings2 } from 'lucide-react';
import type {
  ChangeRequestStatus,
  MaintenanceAgreement,
  MaintenanceBalance,
  MaintenanceEntry,
  MaintenanceMonth,
  MaintenanceStatus,
} from '@scopeprofit/contracts';
import { api, ApiError, errorMessage } from '@/lib/api';
import { maintenanceStatusLabels, maintenanceStatusTone, money, shortDate } from '@/lib/project';

interface ChangeRequestOption {
  id: string;
  request: string;
  status: ChangeRequestStatus;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const toIsoDate = (value: string) => (value ? `${value}T00:00:00.000Z` : '');

export function MaintenancePanel({
  projectId,
  professional,
  token,
}: {
  projectId: string;
  professional: boolean;
  token?: string;
}) {
  const [agreement, setAgreement] = useState<MaintenanceAgreement | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [balance, setBalance] = useState<MaintenanceBalance | null>(null);
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestOption[]>([]);
  const [hoursPerMonth, setHoursPerMonth] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [startDate, setStartDate] = useState('');
  const [entryDate, setEntryDate] = useState(todayIso);
  const [entryHours, setEntryHours] = useState('');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryChangeRequestId, setEntryChangeRequestId] = useState('');

  const load = useCallback(
    () =>
      api<MaintenanceAgreement>(`/projects/${projectId}/maintenance`, {}, token)
        .then(
          (data) => {
            setAgreement(data);
            setMissing(false);
            setError('');
          },
          (e: unknown) => {
            if (e instanceof ApiError && (e.code === 'MAINTENANCE_NOT_FOUND' || e.status === 404)) {
              setAgreement(null);
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

  const loadMonth = useCallback(
    (value: string) =>
      Promise.all([
        api<MaintenanceBalance>(
          `/projects/${projectId}/maintenance/balance?month=${value}`,
          {},
          token,
        ),
        api<MaintenanceMonth>(
          `/projects/${projectId}/maintenance/entries?month=${value}`,
          {},
          token,
        ),
      ]).then(
        ([nextBalance, monthEntries]) => {
          setBalance(nextBalance);
          setEntries(monthEntries.entries);
          setError('');
        },
        (e: unknown) => setError(errorMessage(e)),
      ),
    [projectId, token],
  );
  useEffect(() => {
    if (!agreement) return;
    void loadMonth(month);
  }, [agreement, month, loadMonth]);

  useEffect(() => {
    if (!agreement) return;
    let active = true;
    api<ChangeRequestOption[]>(`/projects/${projectId}/change-requests`, {}, token)
      .then((rows) => {
        if (active) setChangeRequests(rows);
      })
      .catch(() => {
        if (active) setChangeRequests([]);
      });
    return () => {
      active = false;
    };
  }, [agreement, projectId, token]);

  function validateHoursAndPrice(): string | null {
    const hours = Number(hoursPerMonth);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 9999.99)
      return 'Cargá las horas por mes del retainer (máximo 9999,99).';
    if (monthlyPrice !== '' && (!Number.isFinite(Number(monthlyPrice)) || Number(monthlyPrice) < 0))
      return 'Revisá el precio por mes: no puede ser negativo.';
    return null;
  }
  function validateAgreement(): string | null {
    const issue = validateHoursAndPrice();
    if (issue) return issue;
    if (!/^[A-Za-z]{3}$/.test(currency.trim()))
      return 'La moneda son tres letras, por ejemplo USD.';
    if (!startDate) return 'Elegí la fecha de inicio del retainer.';
    return null;
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const issue = validateAgreement();
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(
        `/projects/${projectId}/maintenance`,
        {
          method: 'POST',
          body: JSON.stringify({
            hoursPerMonth: Number(hoursPerMonth),
            monthlyPrice: monthlyPrice === '' ? null : Number(monthlyPrice),
            currency: currency.trim().toUpperCase(),
            startDate: toIsoDate(startDate),
          }),
        },
        token,
      );
      setCreating(false);
      setHoursPerMonth('');
      setMonthlyPrice('');
      setStartDate('');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function startEdit() {
    if (!agreement) return;
    setHoursPerMonth(String(agreement.hoursPerMonth));
    setMonthlyPrice(agreement.monthlyPrice === null ? '' : String(agreement.monthlyPrice));
    setEditing(true);
    setError('');
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const issue = validateHoursAndPrice();
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(
        `/projects/${projectId}/maintenance`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            hoursPerMonth: Number(hoursPerMonth),
            monthlyPrice: monthlyPrice === '' ? null : Number(monthlyPrice),
          }),
        },
        token,
      );
      setEditing(false);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(status: MaintenanceStatus) {
    const question =
      status === 'ended'
        ? '¿Finalizar este retainer? Después de finalizarlo no se puede reabrir.'
        : status === 'paused'
          ? '¿Pausar este retainer? Mientras esté pausado no se pueden registrar consumos.'
          : '¿Reanudar este retainer?';
    if (!confirm(question)) return;
    setBusy(true);
    setError('');
    try {
      await api(
        `/projects/${projectId}/maintenance`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        token,
      );
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    const hours = Number(entryHours);
    if (!entryDate) {
      setError('Elegí la fecha del consumo.');
      return;
    }
    if (!Number.isFinite(hours) || hours <= 0 || hours > 9999.99) {
      setError('Las horas del consumo deben ser mayores a cero.');
      return;
    }
    if (!entryDescription.trim()) {
      setError('Contá qué trabajo se hizo en este consumo.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(
        `/projects/${projectId}/maintenance/entries`,
        {
          method: 'POST',
          body: JSON.stringify({
            date: toIsoDate(entryDate),
            hours,
            description: entryDescription.trim(),
            ...(entryChangeRequestId ? { changeRequestId: entryChangeRequestId } : {}),
          }),
        },
        token,
      );
      setEntryHours('');
      setEntryDescription('');
      setEntryChangeRequestId('');
      setEntryDate(todayIso());
      const entryMonth = entryDate.slice(0, 7);
      if (entryMonth === month) await loadMonth(month);
      else setMonth(entryMonth);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const acceptedChangeRequests = changeRequests.filter((item) => item.status === 'accepted');
  const monthLabel = new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <section className="maintenance-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">RETAINER</p>
          <h2>Mantenimiento</h2>
        </div>
        {agreement && (
          <span className={`tag ${maintenanceStatusTone[agreement.status]}`}>
            {maintenanceStatusLabels[agreement.status]}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando mantenimiento…</p>
      ) : missing ? (
        <div className="maintenance-body">
          <div className="empty-state">
            <span className="empty-icon">
              <CalendarDays size={26} aria-hidden />
            </span>
            <h3>Todavía no hay retainer.</h3>
            <p>
              {professional
                ? 'Definí las horas por mes y el precio para empezar a registrar consumos.'
                : 'Tu profesional todavía no configuró el retainer de mantenimiento de este proyecto.'}
            </p>
            {professional && !creating && (
              <button
                className="button"
                onClick={() => {
                  setCreating(true);
                  setError('');
                }}
              >
                <Plus size={16} aria-hidden /> Crear retainer
              </button>
            )}
          </div>
          {creating && (
            <form className="maintenance-form" onSubmit={create}>
              <label htmlFor="maintenance-hours">Horas por mes</label>
              <input
                id="maintenance-hours"
                type="number"
                min={0}
                max={9999.99}
                step={0.25}
                value={hoursPerMonth}
                onChange={(e) => setHoursPerMonth(e.target.value)}
                placeholder="10"
              />
              <label htmlFor="maintenance-price">Precio por mes (opcional)</label>
              <input
                id="maintenance-price"
                type="number"
                min={0}
                step={0.01}
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                placeholder="Sin precio mensual"
              />
              <label htmlFor="maintenance-currency">Moneda</label>
              <input
                id="maintenance-currency"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
              />
              <label htmlFor="maintenance-start">Fecha de inicio</label>
              <input
                id="maintenance-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <div className="maintenance-actions">
                <button className="button" type="submit" disabled={busy}>
                  {busy ? 'Guardando…' : 'Crear retainer'}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCreating(false);
                    setError('');
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      ) : agreement ? (
        <div className="maintenance-body">
          <div className="maintenance-meta small muted">
            <span>{agreement.hoursPerMonth} h por mes</span>
            <span>
              {agreement.monthlyPrice === null
                ? 'Sin precio mensual'
                : `${money(agreement.monthlyPrice, agreement.currency)} por mes`}
            </span>
            <span>Desde {shortDate(agreement.startDate)}</span>
            {agreement.endDate && <span>Hasta {shortDate(agreement.endDate)}</span>}
          </div>
          {agreement.status === 'paused' && (
            <div className="notice">
              El retainer está pausado: no se pueden registrar consumos hasta reanudarlo.
            </div>
          )}
          {agreement.status === 'ended' && (
            <div className="notice">
              El retainer fue finalizado. El historial sigue disponible para consulta.
            </div>
          )}
          <div className="maintenance-balance">
            <div className="maintenance-month">
              <label htmlFor="maintenance-month">Mes</label>
              <input
                id="maintenance-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value || currentMonth())}
              />
            </div>
            <ul className="maintenance-stats">
              <li>
                <strong>{balance ? balance.consumedRetainer : '—'}</strong>
                <span>Horas del retainer</span>
              </li>
              <li>
                <strong>{balance ? balance.consumedExtra : '—'}</strong>
                <span>Horas extra</span>
              </li>
              <li>
                <strong>{balance ? balance.remaining : '—'}</strong>
                <span>Restantes</span>
              </li>
              <li>
                <strong>{balance ? balance.entriesCount : '—'}</strong>
                <span>Consumos</span>
              </li>
            </ul>
          </div>
          {professional && agreement.status === 'active' && (
            <form className="maintenance-form" onSubmit={addEntry}>
              <h3>Registrar consumo</h3>
              <label htmlFor="maintenance-entry-date">Fecha</label>
              <input
                id="maintenance-entry-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
              <label htmlFor="maintenance-entry-hours">Horas</label>
              <input
                id="maintenance-entry-hours"
                type="number"
                min={0}
                max={9999.99}
                step={0.25}
                value={entryHours}
                onChange={(e) => setEntryHours(e.target.value)}
                placeholder="2"
              />
              <label htmlFor="maintenance-entry-description">Descripción</label>
              <input
                id="maintenance-entry-description"
                maxLength={2000}
                value={entryDescription}
                onChange={(e) => setEntryDescription(e.target.value)}
                placeholder="Soporte, ajustes menores, incidentes…"
              />
              {acceptedChangeRequests.length > 0 && (
                <>
                  <label htmlFor="maintenance-entry-change">Change request (opcional)</label>
                  <select
                    id="maintenance-entry-change"
                    value={entryChangeRequestId}
                    onChange={(e) => setEntryChangeRequestId(e.target.value)}
                  >
                    <option value="">Sin change request</option>
                    {acceptedChangeRequests.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.request}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {changeRequests.length > 0 &&
                acceptedChangeRequests.length < changeRequests.length && (
                  <p className="small muted">
                    Solo los change requests aceptados por el cliente pueden consumir del retainer.
                  </p>
                )}
              <div className="maintenance-actions">
                <button className="button" type="submit" disabled={busy}>
                  <Plus size={16} aria-hidden /> {busy ? 'Registrando…' : 'Registrar consumo'}
                </button>
              </div>
            </form>
          )}
          <div className="maintenance-history">
            <div className="panel-heading">
              <h3>Consumos de {monthLabel}</h3>
              <span className="small muted">{entries.length} en este mes</span>
            </div>
            {entries.length === 0 ? (
              <p className="muted">Todavía no hay consumos en este mes.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Horas</th>
                      <th>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{shortDate(entry.date)}</td>
                        <td>
                          {entry.hours} h
                          {entry.extraHours > 0 && (
                            <span className="tag amber maintenance-extra">
                              extra {entry.extraHours} h
                            </span>
                          )}
                        </td>
                        <td>{entry.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {professional && (
            <div className="maintenance-actions">
              {!editing && (
                <button
                  className="button secondary"
                  onClick={startEdit}
                  disabled={busy || agreement.status === 'ended'}
                >
                  <Settings2 size={16} aria-hidden /> Editar retainer
                </button>
              )}
              {agreement.status === 'active' && (
                <button
                  className="button secondary"
                  onClick={() => void changeStatus('paused')}
                  disabled={busy}
                >
                  <Pause size={16} aria-hidden /> Pausar
                </button>
              )}
              {agreement.status === 'paused' && (
                <button
                  className="button"
                  onClick={() => void changeStatus('active')}
                  disabled={busy}
                >
                  <Play size={16} aria-hidden /> Reanudar
                </button>
              )}
              {agreement.status !== 'ended' && (
                <button
                  className="button secondary"
                  onClick={() => void changeStatus('ended')}
                  disabled={busy}
                >
                  Finalizar
                </button>
              )}
            </div>
          )}
          {editing && (
            <form className="maintenance-form" onSubmit={saveEdit}>
              <h3>Editar retainer</h3>
              <label htmlFor="maintenance-edit-hours">Horas por mes</label>
              <input
                id="maintenance-edit-hours"
                type="number"
                min={0}
                max={9999.99}
                step={0.25}
                value={hoursPerMonth}
                onChange={(e) => setHoursPerMonth(e.target.value)}
              />
              <label htmlFor="maintenance-edit-price">Precio por mes</label>
              <input
                id="maintenance-edit-price"
                type="number"
                min={0}
                step={0.01}
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
              />
              <div className="maintenance-actions">
                <button className="button" type="submit" disabled={busy}>
                  {busy ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setError('');
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No pudimos cargar el mantenimiento.</h3>
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
