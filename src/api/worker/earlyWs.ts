import type { ToWorkerMessage } from "./types";

/**
 * Handle to the early-socket worker spawned from a Blob URL by the
 * index.html inline script (Firedancer builds); the socket itself lives
 * inside that worker (earlyWsWorker.ts). error/closed are set from the
 * worker's pre-adoption status messages.
 */
export interface EarlyWs {
  worker: Worker;
  url: string;
  compress: boolean;
  error: boolean;
  closed: boolean;
}

declare global {
  interface Window {
    __fdWsEarly?: EarlyWs;
  }
}

let earlyWorker: Worker | null = null;

/**
 * Adopt the socket opened inside the early blob worker. A
 * MessageChannel is wired between the blob worker and wsWorker, which
 * then pump buffered then live frames worker-to-worker; the main
 * thread drops out of the data path entirely. Returns false when there
 * is no usable early socket (or it doesn't match the app's connection
 * parameters); the caller then has the worker connect exactly as
 * before.
 */
export function adoptEarlyWs(
  url: string,
  compress: boolean,
  post: (msg: ToWorkerMessage, transfer?: Transferable[]) => void,
): boolean {
  const early = window.__fdWsEarly;
  if (!early) return false;
  delete window.__fdWsEarly; // adoption is first-connection-only

  const { worker } = early;
  if (
    early.error ||
    early.closed ||
    early.url !== url ||
    early.compress !== compress
  ) {
    worker.terminate(); // takes the socket down with it
    return false;
  }

  earlyWorker = worker;
  const channel = new MessageChannel();
  worker.postMessage(channel.port1, [channel.port1]);
  post({ type: "adopt", websocketUrl: url, compress, port: channel.port2 }, [
    channel.port2,
  ]);
  return true;
}

/** Drop the early worker (and its socket) without notifying wsWorker */
export function closeEarlyWs() {
  if (!earlyWorker) return;
  earlyWorker.terminate();
  earlyWorker = null;
}
