/**
 * Optional, cookieless analytics with Plausible (https://plausible.io).
 *
 * Disabled unless both variables are set at build time:
 * - NEXT_PUBLIC_PLAUSIBLE_DOMAIN: the site domain registered in Plausible, e.g. `scopeprofit.app`.
 * - NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC: the tracker URL, e.g. `https://plausible.io/js/script.js`
 *   (or the script of a self-hosted instance). Events are sent to the same origin.
 */
export interface PlausibleConfig {
  domain: string;
  scriptSrc: string;
  origin: string;
}

export function readPlausibleConfig(): PlausibleConfig | null {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  const scriptSrc = process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC?.trim();
  if (!domain && !scriptSrc) {
    return null;
  }
  if (!domain || !scriptSrc) {
    throw new Error(
      'Set both NEXT_PUBLIC_PLAUSIBLE_DOMAIN and NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC to enable analytics, or neither to disable it.',
    );
  }
  const url = new URL(scriptSrc);
  if (url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC must be an https:// URL.');
  }
  return { domain, scriptSrc: url.toString(), origin: url.origin };
}
