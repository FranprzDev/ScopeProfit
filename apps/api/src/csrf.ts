import { NextFunction, Request, Response } from 'express';
import { fail } from './security';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  const webUrl = process.env.WEB_URL;
  if (!webUrl) {
    next();
    return;
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin) {
    if (origin !== webUrl) {
      fail('CSRF_ORIGIN_MISMATCH', 403);
    }
    next();
    return;
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.origin !== new URL(webUrl).origin) {
        fail('CSRF_ORIGIN_MISMATCH', 403);
      }
      next();
      return;
    } catch {
      fail('CSRF_INVALID_REFERER', 403);
    }
  }

  next();
}
