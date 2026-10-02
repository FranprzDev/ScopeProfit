import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/login-form';

export const metadata: Metadata = {
  title: 'Acceso',
  robots: { index: false, follow: false },
};

export default function Login() {
  return (
    <Suspense fallback={<main className="narrow page">Cargando acceso…</main>}>
      <LoginForm />
    </Suspense>
  );
}
