/**
 * @resvg/resvg-js replacement for the Worker bundle (native module). Unreachable in practice:
 * the pele shim already rejects diagram rendering before Resvg is constructed.
 */
export class Resvg {
  constructor(..._args: unknown[]) {
    throw new Error('resvg is not available on this server');
  }
  render(): { width: number; height: number; asPng(): Buffer } {
    throw new Error('resvg is not available on this server');
  }
}
