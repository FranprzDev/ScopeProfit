/**
 * xmcp replacement for the Worker bundle. The api's tool files import `createContext`
 * (runtime) and the InferSchema/ToolMetadata types (type-only, erased at build).
 * Semantics match xmcp's createContext: an AsyncLocalStorage-backed request context with an
 * optional static fallback (used by the stdio context).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ScopeContext<T> {
  provider(value: T, fn: () => unknown): unknown;
  getContext(): T;
}

export function createContext<T>(options: { name: string; fallback: boolean }): ScopeContext<T> {
  const storage = new AsyncLocalStorage<T>();
  let shared: T | undefined;
  return {
    provider(value, fn) {
      if (options.fallback) shared = value;
      return storage.run(value, fn);
    },
    getContext() {
      const value = storage.getStore();
      if (value !== undefined) return value;
      if (options.fallback && shared !== undefined) return shared;
      throw new Error(`xmcp context "${options.name}" is not available outside a provider`);
    },
  };
}

export type InferSchema<T> = { [K in keyof T]: T[K] extends { _output: infer O } ? O : never };
export interface ToolMetadata {
  name: string;
  description: string;
  annotations?: Record<string, unknown>;
}
