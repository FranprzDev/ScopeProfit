import type { ApiResponse } from '@scopeprofit/contracts';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set('content-type', 'application/json');
  if (token) headers.set('x-project-token', token);
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new ApiError(
      result.error?.code ?? 'REQUEST_FAILED',
      result.error?.message ?? 'No se pudo completar la acción.',
      response.status,
    );
  return result.data as T;
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      UNAUTHORIZED: 'Iniciá sesión para continuar.',
      FORBIDDEN: 'No tenés permiso para esta acción.',
      VERSION_CONFLICT:
        'El documento cambió. Recargá la versión antes de guardar. Tu edición sigue en pantalla.',
      PROJECT_NOT_FOUND: 'No encontramos este proyecto o su acceso ya no está disponible.',
      LINK_REVOKED: 'El acceso fue revocado. Pedile un nuevo enlace al profesional.',
      LINK_EXPIRED: 'Este enlace venció. Pedile uno nuevo al profesional.',
      AI_CONFIGURATION_REQUIRED: 'El profesional debe configurar su clave de IA para continuar.',
      RATE_LIMITED: 'Demasiados intentos. Esperá un momento antes de volver a intentar.',
      RATE_CARD_NOT_FOUND: 'Todavía no cargaste tu tarifa por hora.',
      RATE_CARD_REQUIRED: 'Cargá tu tarifa por hora en Configuración para generar la cotización.',
      BRIEF_NO_ESTIMATES:
        'El Brief todavía no tiene estimaciones de horas. Cargá los módulos desde el chat y volvé a intentar.',
      QUOTE_NOT_FOUND: 'Este proyecto todavía no tiene una cotización disponible.',
      QUOTE_NOT_DRAFT: 'La cotización ya fue enviada, por lo que no se puede modificar.',
      QUOTE_NOT_SENDABLE: 'La cotización ya fue respondida por el cliente.',
      INVALID_QUOTE_LINE: 'Revisá las horas de cada línea: el máximo no puede ser menor al mínimo.',
      INVALID_MILESTONES:
        'Los hitos deben sumar 100% en porcentaje, o tener todos montos mayores a cero.',
      MAINTENANCE_NOT_FOUND: 'Este proyecto todavía no tiene un retainer de mantenimiento.',
      MAINTENANCE_EXISTS: 'Este proyecto ya tiene un retainer de mantenimiento.',
      MAINTENANCE_ENDED: 'El retainer fue finalizado y no se puede reabrir.',
      MAINTENANCE_NOT_ACTIVE:
        'El retainer no está activo. Reanudalo antes de registrar un consumo.',
      CHANGE_REQUEST_NOT_ACCEPTED: 'Solo podés vincular un change request aceptado por el cliente.',
      INVALID_MAINTENANCE_AGREEMENT:
        'Revisá las horas por mes, el precio y la fecha de inicio del retainer.',
      INVALID_MAINTENANCE_ENTRY:
        'Revisá la fecha, las horas (mayores a cero) y la descripción del consumo.',
    };
    return messages[error.code] ?? error.message;
  }
  return 'No pudimos conectar. Revisá tu conexión e intentá nuevamente.';
}
export async function downloadFile(path: string, filename: string, token?: string): Promise<void> {
  const headers = new Headers();
  if (token) headers.set('x-project-token', token);
  const response = await fetch(`/api${path}`, {
    method: 'GET',
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    let code = 'REQUEST_FAILED';
    let message = 'No pudimos descargar el archivo.';
    try {
      const result = (await response.json()) as ApiResponse<unknown>;
      if (!result.success) {
        code = result.error.code;
        message = result.error.message;
      }
    } catch {
      code = response.status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
    }
    throw new ApiError(code, message, response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
