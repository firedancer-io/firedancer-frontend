import { useCallback, useEffect } from "react";
import type { FromWorkerMessage, ToWorkerMessage } from "./types";
import { createTypedWorker, type TypedWorker } from "./typedWorker";
import type { SendMessage } from "../ws/types";
import { messageEventType, type MessageEmitter } from "../ws/ConnectionContext";
import EventEmitter from "events";
import WsWorker from "./wsWorker?worker";
import { logError } from "../../logger";
import { getDefaultStore } from "jotai";
import { isDocumentVisibleAtom } from "../../atoms";

const store = getDefaultStore();

let worker: TypedWorker<ToWorkerMessage, FromWorkerMessage> | null = null;
// Singleton so existing listeners keep receiving events if the worker is recreated
const emitter = new EventEmitter().setMaxListeners(1e3) as MessageEmitter;

/**
 * Buffer worker messages and flush once per frame to prevent worker
 * onmessage tasks from starving setTimeout/setInterval on slow machines.
 * RAF when visible; setTimeout(0) when hidden (RAF is suspended, but
 * browsers only throttle timers, bounding buffer growth).
 */
let buffer: FromWorkerMessage[] = [];
let rafId: number | null = null;
let timeoutId: number | null = null;

function flushBuffer() {
  rafId = null;
  timeoutId = null;
  const messages = buffer;
  buffer = [];
  for (const msg of messages) {
    try {
      emitter.emit(messageEventType, msg);
    } catch (e) {
      logError("useWsWorker", "Error processing worker message:", msg.type, e);
    }
  }
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

  if (store.get(isDocumentVisibleAtom)) {
    rafId = requestAnimationFrame(flushBuffer);
  } else {
    timeoutId = window.setTimeout(flushBuffer, 0);
  }
}

const unsubscribeVisibility = store.sub(isDocumentVisibleAtom, () => {
  if (rafId !== null || timeoutId !== null) {
    cancelPendingFlush();
    scheduleFlush();
  }
});

function onMessage(e: MessageEvent<FromWorkerMessage>) {
  buffer.push(e.data);
  scheduleFlush();
}

function startWorker(websocketUrl: string, compress: boolean) {
  if (worker) return;
  if (!websocketUrl.trim()) return;

  worker = createTypedWorker<ToWorkerMessage, FromWorkerMessage>(WsWorker);
  worker.onmessage = onMessage;
  worker.postMessage({ type: "connect", websocketUrl, compress });
}

function stopWorker() {
  cancelPendingFlush();
  buffer = [];
  if (worker) {
    worker.postMessage({ type: "disconnect" });
    worker.terminate();
    worker = null;
  }
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
