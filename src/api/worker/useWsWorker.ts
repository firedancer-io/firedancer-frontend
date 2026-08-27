import { useCallback, useEffect } from "react";
import type { FromWorkerMessage, ToWorkerMessage } from "./types";
import { adoptEarlyWs, attachMainWs, closeEarlyWs } from "./earlyWs";
import { createTypedWorker, type TypedWorker } from "./typedWorker";
import { SocketState, type SendMessage } from "../ws/types";
import { messageEventType, type MessageEmitter } from "../ws/ConnectionContext";
import { MiniEmitter } from "../ws/miniEmitter";
import WsWorker from "./wsWorker?worker";
import { logError } from "../../logger";
import { getDefaultStore } from "jotai";
import { isDocumentVisibleAtom } from "../../atoms";
import { socketStateAtom } from "../ws/atoms";
import { websocketCompress, websocketUrl } from "../consts";
import { applyWorkerMessage } from "../applyWsData";
import {
  isOffscreenChartSupported,
  offscreenChartFailedAtom,
} from "../../features/WebGl/atoms";

const store = getDefaultStore();

let worker: TypedWorker<ToWorkerMessage, FromWorkerMessage> | null = null;
// Singleton so existing listeners keep receiving events if the worker is recreated
const emitter: MessageEmitter = new MiniEmitter();
// Drain messages buffered before the first subscriber attached (the
// reveal-gating head up to the first kvb never waits here: it applies
// straight into the module store on arrival, see flushFirstKvbSync)
emitter.on("newListener", (type) => {
  if (type === messageEventType) {
    scheduleFlush();
  }
});

/**
 * Buffer worker message EVENTS and flush once per frame to prevent
 * worker onmessage tasks from starving setTimeout/setInterval on slow
 * machines. RAF when visible; setTimeout(0) when hidden (RAF is
 * suspended, but browsers only throttle timers, bounding buffer growth).
 *
 * Holding events, not data, matters: the browser deserializes a
 * structured clone lazily on the first `data` access, so a multi-MB
 * backlog batch only pays its 100ms+ deserialize when its flush emits
 * it (post-paint for the reveal transition), not when it lands.
 */
let buffer: { data: FromWorkerMessage }[] = [];
let rafId: number | null = null;
let timeoutId: number | null = null;

function emitMessages(messages: { data: FromWorkerMessage }[]) {
  for (const e of messages) {
    const msg = e.data;
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
  armBootSettled();
}

/**
 * The first kvb gates the reveal, so it applies synchronously on arrival
 * instead of waiting out the rAF batching -- straight into the module
 * store (applyWsData) when React hasn't attached its listener yet, so
 * the mount commit renders with the data and doubles as the reveal.
 * Everything buffered behind it (the rest of the backlog) is deferred
 * past the next paint (rAF -> timeout) so the reveal commit isn't
 * blocked by its deserialize+apply; later batches return to the normal
 * per-frame cadence.
 */
let firstKvbApplied = false;
let postPaintFlushDone = false;

function flushFirstKvbSync() {
  if (firstKvbApplied) return;
  // touches data only up to the first kvb (all small pre-reveal frames);
  // the large batches behind it stay lazily undeserialized
  const i = buffer.findIndex((m) => m.data.type === "kvb");
  if (i < 0) return;
  firstKvbApplied = true;
  const head = buffer.slice(0, i + 1);
  buffer = buffer.slice(i + 1);
  if (emitter.listenerCount(messageEventType) === 0) {
    for (const e of head) {
      try {
        applyWorkerMessage(e.data);
      } catch (err) {
        logError(
          "useWsWorker",
          "Error applying worker message:",
          e.data.type,
          err,
        );
      }
    }
  } else {
    emitMessages(head);
  }
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

/**
 * Boot-settled signal for the worker's peers snapshot hold
 * (wsWorker.ts): after the reveal flush, the first idle callback that
 * finds nothing buffered means the boot-path applies and below-fold
 * mounts stopped saturating the thread. Sent once per connection;
 * reconnects hold a fresh snapshot, so the Connected transition
 * re-arms.
 */
let bootSettledSent = false;
let bootIdleHandle: number | null = null;
// no idle signal without requestIdleCallback: a fixed post-reveal
// delay approximates one
const bootIdleFallbackMs = 200;

function cancelBootSettled() {
  if (bootIdleHandle === null) return;
  if (typeof window.cancelIdleCallback === "function")
    window.cancelIdleCallback(bootIdleHandle);
  else clearTimeout(bootIdleHandle);
  bootIdleHandle = null;
}

function armBootSettled() {
  if (bootSettledSent || bootIdleHandle !== null) return;
  if (!worker || !firstKvbApplied) return;
  if (store.get(socketStateAtom) !== SocketState.Connected) return;
  const check = () => {
    bootIdleHandle = null;
    if (bootSettledSent || !worker) return;
    if (buffer.length) return; // the flush that drains it re-arms
    bootSettledSent = true;
    worker.postMessage({ type: "bootSettled" });
  };
  // hidden: idle callbacks don't run, and there are no paints to
  // protect (the worker still waits out its own decode run)
  if (!store.get(isDocumentVisibleAtom)) {
    bootIdleHandle = window.setTimeout(check, 0);
    return;
  }
  bootIdleHandle =
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(check)
      : window.setTimeout(check, bootIdleFallbackMs);
}

const unsubscribeSocketState = store.sub(socketStateAtom, () => {
  if (store.get(socketStateAtom) === SocketState.Connected) {
    bootSettledSent = false;
    armBootSettled();
  } else {
    cancelBootSettled();
  }
});

/** Gossip-route mount: the full peer set is needed now */
export function requestPeers() {
  worker?.postMessage({ type: "requestPeers" });
}

const maxPreSubscribeBuffer = 10_000;

function onMessage(e: MessageEvent<FromWorkerMessage>) {
  buffer.push(e);
  if (
    buffer.length > maxPreSubscribeBuffer &&
    emitter.listenerCount(messageEventType) === 0
  ) {
    buffer.shift();
  }
  // short-circuit first: once the first kvb applied, later arrivals skip
  // the data access so their deserialize stays deferred to their flush
  if (!firstKvbApplied && e.data.type === "kvb") flushFirstKvbSync();
  scheduleFlush();
}

// The worker stops posting slot:live_shreds to main once the validator
// runs; main-thread charts (Overview fallbacks when the offscreen chart
// is unavailable) ask it to keep the feed on
function sendMainShredsIfNeeded() {
  if (!isOffscreenChartSupported || store.get(offscreenChartFailedAtom))
    worker?.postMessage({ type: "mainShreds", enabled: true });
}

const unsubscribeOffscreenFailed = store.sub(
  offscreenChartFailedAtom,
  sendMainShredsIfNeeded,
);

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
    sendMainShredsIfNeeded();
    return;
  }

  worker = createTypedWorker<ToWorkerMessage, FromWorkerMessage>(WsWorker);
  worker.onmessage = onMessage;
  const w = worker;
  // Adopt the socket opened by the index.html blob worker; otherwise
  // the worker opens its own exactly as before
  if (!adoptEarlyWs(websocketUrl, compress, (msg, t) => w.postMessage(msg, t)))
    worker.postMessage({ type: "connect", websocketUrl, compress });
  sendMainShredsIfNeeded();
}

function stopWorker() {
  cancelPendingFlush();
  cancelBootSettled();
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
    unsubscribeOffscreenFailed();
    unsubscribeSocketState();
    stopWorker();
  });
}
