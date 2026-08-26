import { useCallback, useEffect } from "react";
import type { FromWorkerMessage, ToWorkerMessage } from "./types";
import { adoptEarlyWs, attachMainWs, closeEarlyWs } from "./earlyWs";
import { createTypedWorker, type TypedWorker } from "./typedWorker";
import type { SendMessage } from "../ws/types";
import { messageEventType, type MessageEmitter } from "../ws/ConnectionContext";
import { MiniEmitter } from "../ws/miniEmitter";
import WsWorker from "./wsWorker?worker";
import { logError } from "../../logger";
import { getDefaultStore } from "jotai";
import { isDocumentVisibleAtom } from "../../atoms";
import { websocketCompress, websocketUrl } from "../consts";

const store = getDefaultStore();

let worker: TypedWorker<ToWorkerMessage, FromWorkerMessage> | null = null;
// Singleton so existing listeners keep receiving events if the worker is recreated
const emitter: MessageEmitter = new MiniEmitter();
// Flush messages buffered before the first subscriber attached; the
// microtask lands right after the listener registers (newListener fires
// before that), applying the reveal-gating first kvb without waiting
// out a frame of rAF batching
emitter.on("newListener", (type) => {
  if (type === messageEventType) {
    queueMicrotask(flushFirstKvbSync);
    scheduleFlush();
  }
});

/**
 * Buffer worker messages and flush once per frame to prevent worker
 * onmessage tasks from starving setTimeout/setInterval on slow machines.
 * RAF when visible; setTimeout(0) when hidden (RAF is suspended, but
 * browsers only throttle timers, bounding buffer growth).
 */
let buffer: FromWorkerMessage[] = [];
let rafId: number | null = null;
let timeoutId: number | null = null;

function emitMessages(messages: FromWorkerMessage[]) {
  for (const msg of messages) {
    try {
      emitter.emit(messageEventType, msg);
    } catch (err) {
      logError(
        "useWsWorker",
        "Error processing worker message:",
        msg.type,
        err,
      );
    }
  }
}

function flushBuffer() {
  rafId = null;
  timeoutId = null;
  // Hold messages until the first subscriber attaches
  if (emitter.listenerCount(messageEventType) === 0) return;
  if (firstKvbApplied) postPaintFlushDone = true;
  const messages = buffer;
  buffer = [];
  emitMessages(messages);
}

/**
 * The first kvb gates the reveal, so it applies synchronously instead of
 * waiting out the rAF batching. Everything buffered behind it (the rest
 * of the backlog) is deferred past the next paint (rAF -> timeout) so
 * the reveal commit isn't blocked by its apply; later batches return to
 * the normal per-frame cadence.
 */
let firstKvbApplied = false;
let postPaintFlushDone = false;

function flushFirstKvbSync() {
  if (firstKvbApplied) return;
  if (emitter.listenerCount(messageEventType) === 0) return;
  const i = buffer.findIndex((m) => m.type === "kvb");
  if (i < 0) return;
  firstKvbApplied = true;
  const head = buffer.slice(0, i + 1);
  buffer = buffer.slice(i + 1);
  emitMessages(head);
  cancelPendingFlush();
  scheduleFlush();
}

function cancelPendingFlush() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function scheduleFlush() {
  if (rafId !== null || timeoutId !== null) return;
  if (!buffer.length) return;

  if (!store.get(isDocumentVisibleAtom)) {
    timeoutId = window.setTimeout(flushBuffer, 0);
    return;
  }
  if (firstKvbApplied && !postPaintFlushDone) {
    // reveal commit in flight: hold the next flush past its paint
    rafId = requestAnimationFrame(() => {
      rafId = null;
      timeoutId = window.setTimeout(flushBuffer, 0);
    });
    return;
  }
  rafId = requestAnimationFrame(flushBuffer);
}

const unsubscribeVisibility = store.sub(isDocumentVisibleAtom, () => {
  if (rafId !== null || timeoutId !== null) {
    cancelPendingFlush();
    scheduleFlush();
  }
});

const maxPreSubscribeBuffer = 10_000;

function onMessage(e: MessageEvent<FromWorkerMessage>) {
  buffer.push(e.data);
  if (
    buffer.length > maxPreSubscribeBuffer &&
    emitter.listenerCount(messageEventType) === 0
  ) {
    buffer.shift();
  }
  if (!firstKvbApplied && e.data.type === "kvb") flushFirstKvbSync();
  scheduleFlush();
}

function startWorker(websocketUrl: string, compress: boolean) {
  if (worker) return;
  if (!websocketUrl.trim()) return;

  // Attach to the wsWorker the index.html inline script booted (build
  // only); it adopted the early socket at page start, so decoded batches
  // buffered pre-attach drain through onMessage first
  const attached = attachMainWs(websocketUrl, compress, onMessage);
  if (attached) {
    worker = attached as unknown as TypedWorker<
      ToWorkerMessage,
      FromWorkerMessage
    >;
    return;
  }

  worker = createTypedWorker<ToWorkerMessage, FromWorkerMessage>(WsWorker);
  worker.onmessage = onMessage;
  const w = worker;
  // Adopt the socket opened by the index.html blob worker; otherwise
  // the worker opens its own exactly as before
  if (!adoptEarlyWs(websocketUrl, compress, (msg, t) => w.postMessage(msg, t)))
    worker.postMessage({ type: "connect", websocketUrl, compress });
}

function stopWorker() {
  cancelPendingFlush();
  buffer = [];
  closeEarlyWs();
  if (worker) {
    worker.postMessage({ type: "disconnect" });
    worker.terminate();
    worker = null;
  }
}

// Start during main-bundle evaluation so the worker fetch, zstd init and WS
// handshake overlap bundle parse and React mount
if (typeof Worker !== "undefined") startWorker(websocketUrl, websocketCompress);

/**
 * Open a port over which wsWorker pumps slot:live_shreds values directly
 * to the offscreen shreds chart worker, bypassing the main thread.
 */
export function openShredsChartPort(): MessagePort | null {
  if (!worker) return null;
  const channel = new MessageChannel();
  worker.postMessage({ type: "shredsPort", port: channel.port1 }, [
    channel.port1,
  ]);
  return channel.port2;
}

export function useWsWorker({
  websocketUrl,
  compress,
}: {
  websocketUrl: string;
  compress: boolean;
}) {
  useEffect(() => {
    startWorker(websocketUrl, compress);
    return () => stopWorker();
  }, [websocketUrl, compress]);

  const sendMessage = useCallback<SendMessage>((data) => {
    worker?.postMessage({ type: "send", value: data });
  }, []);

  return { sendMessage, emitter };
}

/**
 * HMR resets `worker` to null, but the worker thread keeps running.
 * Terminate it to avoid duplicate connections.
 */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeVisibility();
    stopWorker();
  });
}
