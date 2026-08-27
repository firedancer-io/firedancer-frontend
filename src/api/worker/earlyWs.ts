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
 * only) had the blob worker boot it as a NESTED worker (so its startup
 * never queues behind main-thread bundle eval) with the early-socket
 * adoption wired worker-to-worker. port is the main thread's channel to
 * it; pending holds the message EVENTS it posted before the app
 * attached (port messages with no listener are lost, so the inline
 * script buffers them; events rather than data, so structured clones
 * stay lazily undeserialized until a flush reads them); error is set
 * from the blob worker's spawnfail/nested-error status pre-attach.
 */
export interface MainWs {
  port: MessagePort;
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
 * connection-parameter mismatch) after tearing everything down; the
 * caller then constructs its own wsWorker exactly as before.
 *
 * The nested wsWorker is unreachable by Worker handle from here, so
 * the return value is a Worker facade over the main-thread port;
 * terminate() tears down the blob worker, which owns the nested
 * wsWorker and the socket.
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
    main.port.close();
    main.early.terminate(); // nested wsWorker and socket die with their owner
    return null;
  }

  earlyWorker = main.early; // closeEarlyWs tears down the owner
  for (const ev of main.pending) onMessage(ev as MessageEvent);
  const { port, early } = main;
  port.onmessage = onMessage;
  return {
    postMessage: (msg: unknown, transfer?: Transferable[]) =>
      port.postMessage(msg, transfer ?? []),
    set onmessage(fn: ((e: MessageEvent) => void) | null) {
      port.onmessage = fn;
    },
    terminate: () => {
      port.close();
      early.terminate();
    },
  } as unknown as Worker;
}

/** Drop the early worker (and its socket) without notifying wsWorker */
export function closeEarlyWs() {
  if (!earlyWorker) return;
  earlyWorker.terminate();
  earlyWorker = null;
}
