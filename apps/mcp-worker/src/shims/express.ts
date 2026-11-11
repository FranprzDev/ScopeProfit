/**
 * Stub for the express value imports in the MCP SDK auth handlers. The worker wires the
 * handlers through src/express-lite.ts instead of an express app. The SDK's metadataHandler
 * returns an express Router, so the stub Router is a callable middleware that runs its
 * registered middleware and handlers in order (the SDK only registers on '/').
 */
type Next = (err?: unknown) => void;
type Middleware = (req: unknown, res: unknown, next: Next) => void;

const noopMiddleware: Middleware = (_req, _res, next) => next?.();

function makeRouter(): Middleware & {
  use: (mw: Middleware) => ReturnType<typeof makeRouter>;
  get: (path: string, mw: Middleware) => ReturnType<typeof makeRouter>;
  post: (path: string, mw: Middleware) => ReturnType<typeof makeRouter>;
  all: (path: string, mw: Middleware) => ReturnType<typeof makeRouter>;
} {
  const chain: Middleware[] = [];
  const router = ((req: unknown, res: unknown, done?: Next) => {
    let index = 0;
    const next: Next = (err) => {
      if (err) {
        done?.(err);
        return;
      }
      const mw = chain[index++];
      if (!mw) {
        done?.();
        return;
      }
      try {
        mw(req, res, next);
      } catch (error) {
        done?.(error);
      }
    };
    next();
  }) as ReturnType<typeof makeRouter>;
  router.use = (mw: Middleware) => (chain.push(mw), router);
  router.get = (_path: string, mw: Middleware) => (chain.push(mw), router);
  router.post = (_path: string, mw: Middleware) => (chain.push(mw), router);
  router.all = (_path: string, mw: Middleware) => (chain.push(mw), router);
  return router;
}

const express = Object.assign(makeRouter, {
  json: () => noopMiddleware,
  urlencoded: () => noopMiddleware,
  raw: () => noopMiddleware,
  text: () => noopMiddleware,
  Router: makeRouter,
  static: () => noopMiddleware,
});
export default express;
