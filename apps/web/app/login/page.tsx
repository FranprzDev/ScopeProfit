import { Suspense } from 'react';
import { LoginForm } from '@/components/login-form';
export default function Login() { return <Suspense fallback={<main className="narrow page">Cargando acceso…</main>}><LoginForm/></Suspense>; }
