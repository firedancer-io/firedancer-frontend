import { ZstdInit, type ZstdDec } from "@oneidentity/zstd-js/decompress";
import { logDebug, logError, logWarning } from "../../logger";
import type {
  EarlyPortMessage,
  EarlyPortRequest,
  EarlyWsFrame,
  WsEntity,
  ToWorkerMessage,
} from "./types";
import { WsMessageSchema } from "./wsMessage";
import { createMessageHandler } from "./messageHandler";
import { fillEpochLeaderSlots } from "./epochLeaderSlots";

const reconnectDelayMs = 3_000;
const flushDelayMs = 32; // ~30fps

// Fired at module load so wasm compile overlaps the WS handshake
const zstdPromise: Promise<ZstdDec | undefined> = ZstdInit().catch(
  (e: unknown) => {
    logError(
      "WS",
      "Failed to initialize Zstd, falling back to uncompressed",
      e,
    );
    return undefined;
  },
);

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout>;

let scheduled = false;
let batchStartedAt = 0;
const pendingBatches = new Map<string, WsEntity[]>();

const loggedZodFailures = new Set<string>();

function getZodFailureKey(json: unknown): string | null {
  if (
    json != null &&
    typeof json === "object" &&
    "topic" in json &&
    "key" in json &&
    typeof json.topic === "string" &&
    typeof json.key === "string"
  ) {
    return `${json.topic}:${json.key}`;
  }

  return null;
}

const handler = createMessageHandler((msg) => ctx.postMessage(msg));

// offscreen shreds chart port: live_shreds skip the main thread entirely
let shredsPort: MessagePort | null = null;

function enqueue(item: WsEntity) {
  handler.onMessage(item);

  if (shredsPort && item.topic === "slot" && item.key === "live_shreds") {
    shredsPort.postMessage(item.value);
  }

  const key = `${item.topic}:${item.key}`;
  if (pendingBatches.has(key)) {
    pendingBatches.get(key)?.push(item);
  } else {
    if (!pendingBatches.size) batchStartedAt = performance.now();
    pendingBatches.set(key, [item]);
  }

  if (!scheduled) {
    scheduled = true;
    setTimeout(flush, flushDelayMs);
  }
}

function flush() {
  scheduled = false;
  const items: WsEntity[] = [];
  for (const batch of pendingBatches.values()) {
    for (const item of batch) items.push(item);
  }
  pendingBatches.clear();

  if (items.length) {
    // latest kv type not implemented as everything defaults to batched kvb
    ctx.postMessage({ type: "kvb", items });
  }
}

function connect(url: string, zstd: ZstdDec | undefined) {
  logDebug("WS", `Connecting to API WebSocket ${url.toString()}`);
  handler.onConnectionChange({ type: "connecting" });
  ws = new WebSocket(url, zstd ? ["compress-zstd"] : undefined);
  ws.binaryType = "arraybuffer";

  ws.onopen = function onopen() {
    if (this !== ws) return;

    logDebug("WS", "Connected to API WebSocket");
    handler.onConnectionChange({ type: "connected" });
  };

  ws.onclose = function onclose() {
    if (this !== ws) return;

    logDebug(
      "WS",
      `Disconnected API WebSocket, reconnecting in ${reconnectDelayMs}ms`,
    );
    handler.onConnectionChange({ type: "disconnected" });

    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(url, zstd), reconnectDelayMs);
  };

  ws.onmessage = function onmessage(ev: MessageEvent<unknown>) {
    if (this !== ws) return;
    handleFrame(ev.data, zstd);
  };
}

const decoder = new TextDecoder();

/**
 * Frames at least this size (wire bytes) decode long enough that the
 * already-decoded batch ships first: the connect burst opens with small
 * frames (boot, summary, epoch, leaders, slot replay, stats) followed by
 * multi-MB ones (live_shreds, peers update), and the reveal gates on the
 * first batch. Sized between the largest small frame (~31KB compressed
 * epoch:new; ~100KB on mainnet) and the multi-MB frames' wire size.
 */
const largeFrameBytes = 262_144;
/**
 * Age backstop for the in-frame flush: the burst decodes in an unbroken
 * run of message tasks that starves the flush timer, which would
 * otherwise hold the first batch until the entire backlog is through.
 * Long enough that the whole small-frame opening run (well under 250ms
 * even on slow hardware) ships as one reveal-gating batch, with the
 * size trigger as the primary splitter.
 */
const starvedBatchMs = 250;

function handleFrame(message: unknown, zstd: ZstdDec | undefined) {
  // Ship the pending batch before starting a large decode, and whenever
  // the flush timer has been starved well past its cadence. Frames
  // decode in arrival order; flushing early only makes batches smaller,
  // never reordered.
  if (pendingBatches.size) {
    const bytes =
      typeof message === "string"
        ? message.length
        : message instanceof ArrayBuffer
          ? message.byteLength
          : 0;
    if (
      bytes >= largeFrameBytes ||
      performance.now() - batchStartedAt >= starvedBatchMs
    ) {
      flush();
    }
  }

  try {
    let json = undefined;
    if (typeof message === "string") {
      json = JSON.parse(message) as unknown;
    } else if (message instanceof ArrayBuffer && zstd) {
      json = JSON.parse(
        decoder.decode(zstd.ZstdStream.decompress(new Uint8Array(message))),
      ) as unknown;
    }

    if (json !== undefined) {
      const result = WsMessageSchema.safeParse(json);

      if (result.success) {
        enqueue(fillEpochLeaderSlots(result.data));
        return;
      }

      const failureKey = getZodFailureKey(json);
      if (failureKey == null) {
        logDebug("zod", json);
        logDebug("Zod", result.error.message);
        logDebug("Zod", result.error.issues);
        return;
      } else if (!loggedZodFailures.has(failureKey)) {
        loggedZodFailures.add(failureKey);
        logDebug("zod", json);
        logDebug("Zod", result.error.message);
        logDebug("Zod", result.error.issues);
      }
    }
  } catch (e) {
    logError("WS", e);
  }
}

/**
 * Adopt mode: the blob worker spawned by index.html (earlyWsWorker.ts)
 * owns the early socket and pumps its frames over a MessagePort; the
 * identical decode pipeline runs here, and sends are routed back via
 * "ws-send" on the port. Frames arriving before the decode path is
 * settled (zstd init) queue in pending.
 */
interface Adopt {
  url: string;
  compress: boolean;
  port: MessagePort;
  zstd: ZstdDec | undefined;
  ready: boolean;
  pending: EarlyWsFrame[];
}
let adopt: Adopt | null = null;

function adoptOpen(protocol: string) {
  const a = adopt;
  if (!a) return;
  void (async () => {
    let zstd: ZstdDec | undefined;
    if (protocol === "compress-zstd") {
      zstd = await zstdPromise;
      if (adopt !== a) return;
      if (!zstd) {
        // mirror the init-failure fallback: drop the adopted socket and
        // open a worker-owned uncompressed connection
        adopt = null;
        a.port.postMessage({ type: "close-early" } satisfies EarlyPortRequest);
        a.port.close();
        connect(a.url, undefined);
        return;
      }
    }
    a.zstd = zstd;
    a.ready = true;
    logDebug("WS", "Adopted API WebSocket connection");
    handler.onConnectionChange({ type: "connected" });
    const pending = a.pending;
    a.pending = [];
    for (const frame of pending) handleFrame(frame, zstd);
  })();
}

ctx.onmessage = (e: MessageEvent<ToWorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case "connect":
      void (async () => {
        connect(msg.websocketUrl, msg.compress ? await zstdPromise : undefined);
      })();
      break;
    case "adopt": {
      const a: Adopt = {
        url: msg.websocketUrl,
        compress: msg.compress,
        port: msg.port,
        zstd: undefined,
        ready: false,
        pending: [],
      };
      adopt = a;
      // adopted-mode transport: the blob worker pumps adopt-open,
      // frames and adopt-closed over the transferred port
      a.port.onmessage = (e: MessageEvent<EarlyPortMessage>) => {
        if (adopt !== a) return;
        const pm = e.data;
        switch (pm.type) {
          case "adopt-open":
            adoptOpen(pm.protocol);
            break;
          case "frame":
            if (a.ready) handleFrame(pm.data, a.zstd);
            else a.pending.push(pm.data);
            break;
          case "adopt-closed":
            // adoption is first-connection-only: the existing reconnect
            // logic takes over with a worker-owned socket
            adopt = null;
            a.port.close();
            logDebug(
              "WS",
              `Disconnected adopted WebSocket, reconnecting in ${reconnectDelayMs}ms`,
            );
            handler.onConnectionChange({ type: "disconnected" });
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              void (async () => {
                connect(a.url, a.compress ? await zstdPromise : undefined);
              })();
            }, reconnectDelayMs);
            break;
        }
      };
      handler.onConnectionChange({ type: "connecting" });
      break;
    }
    case "shredsPort":
      shredsPort?.close();
      shredsPort = msg.port;
      break;
    case "disconnect":
      if (adopt) {
        adopt.port.close();
        adopt = null;
      }
      clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          logError("WS", "Error closing WebSocket");
        }
        ws = null;
      }
      break;
    case "send":
      if (adopt) {
        // the blob worker owns the adopted socket
        adopt.port.postMessage({
          type: "ws-send",
          data: JSON.stringify(msg.value),
        } satisfies EarlyPortRequest);
      } else if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg.value));
      } else {
        logWarning("WS", "Attempting to send on closed WebSocket", msg.value);
      }

      break;
  }
};
