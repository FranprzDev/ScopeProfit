import { readPlausibleConfig } from '@/lib/analytics';
import { VercelAnalytics } from './vercel-analytics';

export function Analytics() {
  if (process.env.VERCEL_ENV === 'production') {
    return <VercelAnalytics />;
  }
  const config = readPlausibleConfig();
  if (!config) {
    return null;
  }
  return <script defer data-domain={config.domain} src={config.scriptSrc} />;
}
