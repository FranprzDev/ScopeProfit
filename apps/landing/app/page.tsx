import type { Metadata } from 'next';
import HomeClient from './home-client';

const SITE_URL = 'https://scopeprofit.app';

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true },
};

export default function Home() {
  return <HomeClient />;
}
