import { AsyncLocalStorage } from "node:async_hooks";
import type { LogActor } from "./types.js";

export type RequestLogContext = {
  requestId: string;
  startTime: number;
  method: string;
  endpoint: string;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
  actor?: LogActor | null | undefined;
  semanticLogEmitted: boolean;
};

export const requestContextStorage = new AsyncLocalStorage<RequestLogContext>();

export function getRequestContext(): RequestLogContext | undefined {
  return requestContextStorage.getStore();
}

export function markSemanticLogEmitted(): void {
  const store = requestContextStorage.getStore();
  if (store) {
    store.semanticLogEmitted = true;
  }
}
