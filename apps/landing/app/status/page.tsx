import type { Metadata } from 'next';
import StatusClient from './status-client';

const SITE_URL = 'https://scopeprofit.app';

export const metadata: Metadata = {
  title: 'Estado del servicio',
  description: 'Estado operativo actual de ScopeProfit y servicios asociados.',
  alternates: { canonical: `${SITE_URL}/status` },
  robots: { index: true, follow: true },
};

export default function Status() {
  return <StatusClient />;
}
