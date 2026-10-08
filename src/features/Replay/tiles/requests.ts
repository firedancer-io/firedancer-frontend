import type { FetchResult } from "./splitFetch";

const REQUEST_TIMEOUT_MS = 15_000;

interface PendingRequest<T> {
  promise: Promise<FetchResult<T>>;
  resolve: (result: FetchResult<T>) => void;
}

export interface PendingRequests<T> {
  awaitResponse: (id: number) => Promise<FetchResult<T>>;
  resolve: (id: number, result: FetchResult<T>) => void;
  failAll: () => void;
}

/** Pairs each request with its response by id so callers can await the reply. */
export function createPendingRequests<T>(
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): PendingRequests<T> {
  const pending = new Map<number, PendingRequest<T>>();

  function resolve(id: number, result: FetchResult<T>): void {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    request.resolve(result);
  }

  return {
    awaitResponse(id) {
      let resolvePromise: (result: FetchResult<T>) => void;
      const promise = new Promise<FetchResult<T>>((res) => {
        resolvePromise = res;
      });

      const timer = setTimeout(
        () => resolve(id, { errorCode: "timeout" }),
        timeoutMs,
      );

      pending.set(id, {
        promise,
        resolve: (result) => {
          clearTimeout(timer);
          resolvePromise(result);
        },
      });
      return promise;
    },

    resolve,

    failAll() {
      for (const id of [...pending.keys()])
        resolve(id, { errorCode: "fail_all_pending" });
    },
  };
}
