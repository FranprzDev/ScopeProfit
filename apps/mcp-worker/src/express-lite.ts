/**
 * Minimal express Request/Response emulation so the MCP SDK's OAuth handlers
 * (authorizationHandler, tokenHandler, clientRegistrationHandler, revocationHandler,
 * metadataHandler) and ScopeProfit's consent page run unchanged inside a Cloudflare Worker.
 * Covers exactly the surface those handlers use: req.query/body/headers/protocol/hostname,
 * res.status/json/send/redirect/set/setHeader/type/end.
 */
import {
  InvalidClientError,
  InvalidTokenError,
  OAuthError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';

export class LiteRequest {
  readonly method: string;
  readonly query: Record<string, string>;
  readonly headers: Headers;
  readonly protocol = 'https';
  body: unknown;
  auth?: unknown;
  client?: unknown;

  constructor(
    readonly request: Request,
    readonly url: URL,
  ) {
    this.method = request.method;
    this.headers = request.headers;
    this.query = Object.fromEntries(url.searchParams.entries());
  }

  get hostname() {
    return this.url.hostname;
  }
  get path() {
    return this.url.pathname;
  }
  get search() {
    return this.url.search;
  }

  header(name: string) {
    return this.headers.get(name) ?? undefined;
  }
  get(name: string) {
    return this.header(name);
  }
}

export class LiteResponse {
  statusCode = 200;
  readonly headers = new Headers();
  private body: unknown = '';
  private isJson = true;

  status(code: number) {
    this.statusCode = code;
    return this;
  }
  set(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }
  setHeader(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }
  getHeader(name: string) {
    return this.headers.get(name);
  }
  type(kind: string) {
    this.headers.set(
      'content-type',
      kind === 'html' ? 'text/html; charset=utf-8' : kind === 'json' ? 'application/json' : kind,
    );
    this.isJson = kind === 'json';
    return this;
  }
  json(body: unknown) {
    this.body = body;
    this.isJson = true;
    if (!this.headers.has('content-type')) this.headers.set('content-type', 'application/json');
    return this;
  }
  send(body: unknown) {
    this.body = body;
    if (typeof body === 'string') this.isJson = false;
    return this;
  }
  redirect(target: string): void;
  redirect(code: number, target: string): void;
  redirect(codeOrTarget: number | string, maybeTarget?: string) {
    const code = typeof codeOrTarget === 'number' ? codeOrTarget : 302;
    const target = typeof codeOrTarget === 'number' ? maybeTarget! : codeOrTarget;
    this.statusCode = code;
    this.headers.set('location', target);
    this.body = '';
  }
  end(body?: unknown) {
    if (body !== undefined) this.body = body;
  }

  toResponse(): Response {
    let payload: BodyInit | null;
    if (this.body === '' || this.body === undefined || this.body === null) {
      payload = this.statusCode === 204 ? null : '';
    } else if (this.isJson && typeof this.body !== 'string') {
      payload = JSON.stringify(this.body);
      if (!this.headers.has('content-type')) this.headers.set('content-type', 'application/json');
    } else {
      payload = String(this.body);
      if (!this.headers.has('content-type')) this.headers.set('content-type', 'text/html; charset=utf-8');
    }
    return new Response(payload, { status: this.statusCode, headers: this.headers });
  }
}

type LiteHandler = (req: LiteRequest, res: LiteResponse, next: (error?: unknown) => void) => unknown;

/** Runs one express-style handler and resolves with the web-standard Response. */
export async function runHandler(
  handler: LiteHandler,
  req: LiteRequest,
  res: LiteResponse,
): Promise<Response> {
  let nextError: unknown;
  try {
    await handler(req, res, (error?: unknown) => {
      nextError = error;
    });
  } catch (error) {
    nextError = error;
  }
  if (nextError) return errorResponse(nextError);
  return res.toResponse();
}

function errorResponse(error: unknown): Response {
  if (error instanceof OAuthError) {
    const status = error instanceof InvalidTokenError || error instanceof InvalidClientError ? 401 : 400;
    return new Response(JSON.stringify(error.toResponseObject()), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
  console.error('oauth endpoint failed', error);
  return new Response(JSON.stringify({ error: 'server_error', error_description: 'Internal error' }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  });
}

/** Parses a request body the way express.urlencoded / express.json would. */
export async function parseBody(request: Request): Promise<unknown> {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  if (type === 'application/x-www-form-urlencoded') {
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  if (type === 'application/json') {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }
  return {};
}
