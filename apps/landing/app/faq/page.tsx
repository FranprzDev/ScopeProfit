import type { Metadata } from 'next';
import FaqClient from './faq-client';

const SITE_URL = 'https://scopeprofit.app';

export const metadata: Metadata = {
  title: 'Preguntas frecuentes',
  description:
    'Respuestas sobre Telegram, IA, documentos y seguridad. Todo lo que necesitás saber sobre ScopeProfit.',
  alternates: { canonical: `${SITE_URL}/faq` },
  robots: { index: true, follow: true },
};

export default function Faq() {
  return <FaqClient />;
}
