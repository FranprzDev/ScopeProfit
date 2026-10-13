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
    <main className="shell">
      <h1>Algo salió mal.</h1>
      <p>Hubo un error inesperado. Por favor, intentá de nuevo.</p>
      <button className="shell-button" onClick={() => reset()}>
        Reintentar
      </button>
    </main>
  );
}
