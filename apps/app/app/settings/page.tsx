import type { Metadata } from 'next';
import SettingsClient from './settings-client';

export const metadata: Metadata = {
  title: 'Configuración',
  robots: { index: false, follow: false },
};

export default function Settings() {
  return <SettingsClient />;
}
