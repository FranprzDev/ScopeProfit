/**
 * Minimal @nestjs/common replacement for the Worker bundle. The MCP worker reuses the
 * framework-free domain services from apps/api; Nest only supplies the HttpException shape
 * (caught by tool-contracts.ts and mapped to MCP tool errors) and no-op decorators.
 * The real Nest app keeps using the real package; this shim is build-time only.
 */
export class HttpException extends Error {
  constructor(
    private readonly body: unknown,
    private readonly statusCode: number,
  ) {
    super(
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : String(body),
    );
    this.name = 'HttpException';
  }
  getResponse() {
    return this.body;
  }
  getStatus() {
    return this.statusCode;
  }
}

type ClassDecorator = (target: unknown) => void;
export const Injectable = (): ClassDecorator => () => undefined;
export const Catch = (): ClassDecorator => () => undefined;
export const Module = (): ClassDecorator => () => undefined;
export const Controller = (): ClassDecorator => () => undefined;

export class Logger {
  constructor(private readonly context = '') {}
  static log(message: unknown, context?: string) {
    console.log(`[${context ?? 'app'}]`, message);
  }
  static warn(message: unknown, context?: string) {
    console.warn(`[${context ?? 'app'}]`, message);
  }
  static error(message: unknown, trace?: unknown, context?: string) {
    console.error(`[${context ?? 'app'}]`, message, trace ?? '');
  }
  log(message: unknown) {
    Logger.log(message, this.context);
  }
  warn(message: unknown) {
    Logger.warn(message, this.context);
  }
  error(message: unknown, trace?: unknown) {
    Logger.error(message, trace, this.context);
  }
}

export interface OnModuleInit {
  onModuleInit(): unknown;
}
export interface OnModuleDestroy {
  onModuleDestroy(): unknown;
}
export type INestApplication = unknown;
export type ArgumentsHost = unknown;
export type ExceptionFilter = unknown;
