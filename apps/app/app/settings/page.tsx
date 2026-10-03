'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RateCard, User } from '@scopeprofit/contracts';
import { api, ApiError, errorMessage } from '@/lib/api';
export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [rateCard, setRateCard] = useState<RateCard | null>(null);
  const [rateLoading, setRateLoading] = useState(true);
  const [rateBusy, setRateBusy] = useState(false);
  const [rateError, setRateError] = useState('');
  const [rateSaved, setRateSaved] = useState(false);
  const [label, setLabel] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [currency, setCurrency] = useState('');
  const [marginPercent, setMarginPercent] = useState('');
  useEffect(() => {
    api<User>('/auth/me')
      .then((u) => {
        if (u.role !== 'professional') router.replace('/dashboard');
        else setUser(u);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/login');
        else setError(errorMessage(e));
      });
  }, [router]);
  useEffect(() => {
    if (user?.role !== 'professional') return;
    let active = true;
    api<RateCard>('/me/rate-card')
      .then((card) => {
        if (!active) return;
        setRateCard(card);
        setLabel(card.label);
        setHourlyRate(String(card.hourlyRate));
        setCurrency(card.currency);
        setMarginPercent(String(card.marginPercent));
      })
      .catch((e) => {
        if (active && !(e instanceof ApiError && e.status === 404)) setRateError(errorMessage(e));
      })
      .finally(() => {
        if (active) setRateLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api('/auth/ai-key', { method: 'PUT', body: JSON.stringify({ apiKey: key }) });
      setKey('');
      setUser((u) => (u ? { ...u, hasAiApiKey: true } : u));
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveRateCard(e: React.FormEvent) {
    e.preventDefault();
    const rate = Number(hourlyRate);
    const margin = Number(marginPercent);
    const code = currency.trim();
    if (!label.trim()) {
      setRateError('Ponéle un nombre a tu tarifa, por ejemplo “Estándar”.');
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setRateError('La tarifa por hora debe ser mayor a cero.');
      return;
    }
    if (!Number.isInteger(margin) || margin < 0 || margin > 100) {
      setRateError('El margen debe ser un número entero entre 0 y 100.');
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(code)) {
      setRateError('La moneda necesita tres letras, por ejemplo USD.');
      return;
    }
    setRateBusy(true);
    setRateError('');
    setRateSaved(false);
    try {
      const card = await api<RateCard>('/me/rate-card', {
        method: 'PUT',
        body: JSON.stringify({
          label: label.trim(),
          hourlyRate: rate,
          currency: code,
          marginPercent: margin,
        }),
      });
      setRateCard(card);
      setRateSaved(true);
    } catch (e) {
      setRateError(errorMessage(e));
    } finally {
      setRateBusy(false);
    }
  }
  return (
    <main className="narrow page">
      <Link className="text-link" href="/dashboard">
        ← Mis proyectos
      </Link>
      <p className="eyebrow space-top">CONFIGURACIÓN</p>
      <h1>Tu IA. Tu clave.</h1>
      <p className="intro">
        ScopeProfit usa la clave de Gemini del propietario de cada proyecto. Conservás el control
        del consumo y los límites de tu cuenta.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {user ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>Google Gemini</h2>
            <span className="tag">{user.hasAiApiKey ? 'Clave configurada' : 'Sin configurar'}</span>
          </div>
          <form onSubmit={save}>
            <label htmlFor="api-key">
              {user.hasAiApiKey ? 'Reemplazar clave API' : 'Clave API'}
            </label>
            <input
              id="api-key"
              type="password"
              required
              minLength={10}
              maxLength={512}
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Pegá tu clave de Google AI Studio"
            />
            <p className="small muted">
              Se cifra en el servidor. Nunca volvemos a mostrarla ni la guardamos en este navegador.
            </p>
            <button className="button" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar clave segura'}
            </button>
            {saved && (
              <p role="status" className="success">
                Clave guardada. Ya podés retomar el relevamiento de tus proyectos.
              </p>
            )}
          </form>
          <p className="small muted">
            Los cargos o cuotas del proveedor corresponden a tu cuenta de Google. No compartas tu
            clave por el chat.
          </p>
        </section>
      ) : (
        <p role="status">Verificando acceso…</p>
      )}
      {user && (
        <section className="panel space-top">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PRECIO</p>
              <h2>Tarifa por hora</h2>
            </div>
            <span className="tag">{rateCard ? 'Configurada' : 'Sin configurar'}</span>
          </div>
          <p className="small muted">
            Se usa para calcular cada cotización a partir de las estimaciones del Brief. El margen
            se suma sobre la tarifa base.
          </p>
          {rateError && (
            <p role="alert" className="error">
              {rateError}
            </p>
          )}
          {rateLoading ? (
            <p role="status">Cargando tarifa…</p>
          ) : (
            <form onSubmit={saveRateCard}>
              <label htmlFor="rate-label">Nombre de la tarifa</label>
              <input
                id="rate-label"
                required
                maxLength={200}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Estándar"
              />
              <label htmlFor="rate-hourly">Tarifa por hora</label>
              <input
                id="rate-hourly"
                type="number"
                required
                min={0.01}
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="80"
              />
              <label htmlFor="rate-currency">Moneda</label>
              <input
                id="rate-currency"
                required
                minLength={3}
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
              />
              <label htmlFor="rate-margin">Margen %</label>
              <input
                id="rate-margin"
                type="number"
                required
                min={0}
                max={100}
                step={1}
                value={marginPercent}
                onChange={(e) => setMarginPercent(e.target.value)}
                placeholder="10"
              />
              <button className="button" disabled={rateBusy}>
                {rateBusy ? 'Guardando…' : 'Guardar tarifa'}
              </button>
              {rateSaved && (
                <p role="status" className="success">
                  Tarifa guardada. Las próximas cotizaciones van a usar este precio.
                </p>
              )}
            </form>
          )}
          {!rateLoading && !rateCard && (
            <p className="small muted">
              Todavía no cargaste tu tarifa: sin ella no se puede generar ninguna cotización.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
