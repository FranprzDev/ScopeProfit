/** Ambient types so the reused api sources typecheck against the worker shims. */
declare namespace Express {
  namespace Multer {
    interface File {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
      fieldname?: string;
    }
  }
}

declare module 'express' {
  export interface Response {
    setHeader(name: string, value: string): void;
    status(code: number): Response;
    type(kind: string): Response;
    send(body: unknown): void;
    redirect(code: number, url: string): void;
    redirect(url: string): void;
    json(body: unknown): void;
  }
  export interface Request {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    auth?: { extra?: unknown };
  }
  export type NextFunction = (error?: unknown) => void;
  export interface Express {}
  const express: unknown;
  export default express;
}

// Minimal Cloudflare Worker globals used by this package (avoids pulling the full
// @cloudflare/workers-types, whose DOM URL conflicts with @types/node in reused api code).
interface R2Object {
  arrayBuffer(): Promise<ArrayBuffer>;
}
interface R2Bucket {
  put(key: string, value: Buffer | ArrayBuffer | string): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}
interface KVNamespace {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: Record<string, unknown>): Promise<void>;
  get(key: string, options?: { type?: string }): Promise<ArrayBuffer | string | null>;
  delete(key: string): Promise<void>;
}
