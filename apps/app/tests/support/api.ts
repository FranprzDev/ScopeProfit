import type { ApiResponse } from '@scopeprofit/contracts';
import { appBaseUrl } from './env';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  session?: string;
  token?: string;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers();
  if (options.session) headers.set('cookie', `sp_session=${options.session}`);
  if (options.token) headers.set('x-project-token', options.token);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${appBaseUrl()}/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'manual',
  });
  const raw = await response.text();
  let payload: ApiResponse<T> | undefined;
  if (raw) {
    try {
      payload = JSON.parse(raw) as ApiResponse<T>;
    } catch {
      payload = undefined;
    }
  }
  if (!payload)
    throw new ApiError(
      'NON_JSON_RESPONSE',
      `respuesta sin JSON (${response.status}): ${raw.slice(0, 200)}`,
      response.status,
    );
  if (!payload.success)
    throw new ApiError(payload.error.code, payload.error.message, response.status);
  return payload.data;
}
