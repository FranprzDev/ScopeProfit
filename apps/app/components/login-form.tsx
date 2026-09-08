'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/auth/magic-link/request', { method: 'POST', body: JSON.stringify({ email, ...(params.get('projectId') ? { projectId: params.get('projectId'), linkToken: params.get('token') ?? undefined } : {}) }) }); setSent(true); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">TU ESPACIO DE TRABAJO</p><h1>{sent ? 'Revisá tu correo.' : 'Volvamos a lo importante.'}</h1><p className="intro">{sent ? 'Si tu cuenta tiene acceso, recibirás un enlace para entrar. Revisá también la carpeta de spam.' : 'Entrá con un enlace seguro. Sin contraseñas que recordar.'}</p>{!sent ? <form onSubmit={submit}><label htmlFor="email">Correo electrónico</label><input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="vos@tuestudio.com"/><button className="button full" disabled={busy}>{busy ? 'Enviando…' : 'Recibir enlace de acceso →'}</button></form> : <><div className="notice">El enlace vence en 15 minutos y se puede usar una sola vez.</div><button className="button secondary full" onClick={() => setSent(false)}>Usar otro correo o reenviar</button></>}{error && <p role="alert" className="error">{error}</p>}<p className="small muted">¿Sos cliente? Abrí el enlace que te compartió tu profesional para acceder a tu proyecto.</p></section></main>;
}
