/**
 * pele (server-side Mermaid renderer) replacement for the Worker bundle. Pele depends on a
 * DOM and cannot run on Cloudflare Workers, so diagrams cannot be rendered here. Saving a
 * brief that contains diagrams and exporting a document with diagrams both fail with a clear
 * error on the worker; documents without diagrams export normally (PDF/DOCX/MD).
 */
export class PeleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PeleError';
  }
}

export function render(..._args: unknown[]): { svg: string; width: number; height: number } {
  throw new PeleError(
    'Diagrams cannot be rendered on this server yet; remove the diagrams section and retry.',
  );
}
