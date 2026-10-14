import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="shell">
      <h1>Página no encontrada.</h1>
      <p>La página que buscás no existe o fue movida.</p>
      <Link className="shell-button" href="/">
        Volver al inicio
      </Link>
    </main>
  );
}
