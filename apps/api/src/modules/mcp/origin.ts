const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Origin allowlist for browser-based MCP clients: the issuer itself, the configured web app,
 * and loopback origins so local tooling (MCP Inspector, agent CLIs with a browser) can connect.
 * Bearer auth still applies; the origin check only blocks cross-site browser calls.
 */
export function isAllowedOrigin(
  origin: string | null | undefined,
  issuerOrigin: string,
  webUrl?: string,
): boolean {
  if (!origin) return true;
  if (origin === issuerOrigin || origin === webUrl) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'http:' && LOOPBACK_HOSTS.has(hostname);
  } catch {
    return false;
  }
}
