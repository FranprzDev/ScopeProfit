'use client';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="narrow page">
      <p className="eyebrow">ERROR</p>
      <h1>Algo salió mal.</h1>
      <p className="intro">Hubo un error inesperado. Por favor, intentá de nuevo.</p>
      <button className="button" onClick={() => reset()}>
        Reintentar
      </button>
    </main>
  );
}
