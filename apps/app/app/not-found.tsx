import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="narrow page">
      <p className="eyebrow">404</p>
      <h1>Página no encontrada.</h1>
      <p className="intro">La página que buscás no existe o fue movida.</p>
      <Link className="button" href="/dashboard">
        Volver al dashboard
      </Link>
    </main>
  );
}
