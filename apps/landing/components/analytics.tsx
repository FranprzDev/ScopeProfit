import { readPlausibleConfig } from '@/lib/analytics';

/** Renders the Plausible tracker only when analytics is configured; otherwise nothing. */
export function Analytics() {
  const config = readPlausibleConfig();
  if (!config) {
    return null;
  }
  return <script defer data-domain={config.domain} src={config.scriptSrc} />;
}
