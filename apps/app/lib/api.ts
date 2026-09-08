export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  if (token) headers.set('x-project-token', token);
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json();
  if (!response.ok || !result.success) throw new ApiError(result.error?.code ?? 'REQUEST_FAILED', result.error?.message ?? 'No se pudo completar la acción.', response.status);
  return result.data as T;
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      UNAUTHORIZED: 'Iniciá sesión para continuar.', FORBIDDEN: 'No tenés permiso para esta acción.',
      VERSION_CONFLICT: 'El documento cambió. Recargá la versión antes de guardar. Tu edición sigue en pantalla.',
      PROJECT_NOT_FOUND: 'No encontramos este proyecto o su acceso ya no está disponible.',
      LINK_REVOKED: 'El acceso fue revocado. Pedile un nuevo enlace al profesional.',
      LINK_EXPIRED: 'Este enlace venció. Pedile uno nuevo al profesional.',
      AI_CONFIGURATION_REQUIRED: 'El profesional debe configurar su clave de IA para continuar.',
      RATE_LIMITED: 'Demasiados intentos. Esperá un momento antes de volver a intentar.',
    };
    return messages[error.code] ?? error.message;
  }
  return 'No pudimos conectar. Revisá tu conexión e intentá nuevamente.';
}
