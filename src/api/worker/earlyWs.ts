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

/**
 * Handle to the real wsWorker when the index.html inline script (build
 * only) booted it and wired the early-socket adoption itself. pending
 * holds the messages the worker posted before the app attached (Worker
 * messages with no listener are lost, so the inline script buffers
 * them); error is set from the worker's error event pre-attach.
 */
export interface MainWs {
  worker: Worker;
  early: Worker;
  url: string;
  compress: boolean;
  error: boolean;
  pending: unknown[];
}

declare global {
  interface Window {
    __fdWsEarly?: EarlyWs;
    __fdWsMain?: MainWs;
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

/**
 * Attach to the wsWorker the inline script booted (adoption already
 * wired worker-to-worker). Drains the inline pending buffer through
 * onMessage, then routes live messages to it; everything is synchronous
 * so no message can interleave with the drain. Returns null when there
 * is no usable parked worker (not spawned, errored pre-attach, or
 * connection-parameter mismatch) after tearing both workers down; the
 * caller then constructs its own wsWorker exactly as before.
 */
export function attachMainWs(
  url: string,
  compress: boolean,
  onMessage: (e: MessageEvent) => void,
): Worker | null {
  const main = window.__fdWsMain;
  if (!main) return null;
  delete window.__fdWsMain; // attach is first-connection-only

  if (main.error || main.url !== url || main.compress !== compress) {
    main.worker.terminate();
    main.early.terminate(); // the adopted socket dies with its owner
    return null;
  }

  earlyWorker = main.early; // closeEarlyWs tears down the socket owner
  for (const data of main.pending) onMessage({ data } as MessageEvent);
  main.worker.onmessage = onMessage;
  return main.worker;
}

/** Drop the early worker (and its socket) without notifying wsWorker */
export function closeEarlyWs() {
  if (!earlyWorker) return;
  earlyWorker.terminate();
  earlyWorker = null;
}
