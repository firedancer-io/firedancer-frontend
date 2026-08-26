import { ZstdInit, type ZstdDec } from "@oneidentity/zstd-js/decompress";
import { logDebug, logError, logWarning } from "../../logger";
import {
  WsMessageSchema,
  type EarlyWsFrame,
  type FromWorkerControlMessage,
  type WsEntity,
  type ToWorkerMessage,
} from "./types";
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

function enqueue(item: WsEntity) {
  handler.onMessage(item);

  const key = `${item.topic}:${item.key}`;
  if (pendingBatches.has(key)) {
    pendingBatches.get(key)?.push(item);
  } else {
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

function handleFrame(message: unknown, zstd: ZstdDec | undefined) {
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
 * Adopt mode: the main thread owns the socket opened by index.html
 * (earlyWs.ts) and forwards its frames; the identical decode pipeline
 * runs here, and sends are routed back via "ws-send". Frames arriving
 * before the decode path is settled (zstd init) queue in pending.
 */
interface Adopt {
  url: string;
  compress: boolean;
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
        ctx.postMessage({
          type: "close-early",
        } satisfies FromWorkerControlMessage);
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
    case "adopt":
      adopt = {
        url: msg.websocketUrl,
        compress: msg.compress,
        zstd: undefined,
        ready: false,
        pending: msg.frames,
      };
      handler.onConnectionChange({ type: "connecting" });
      if (msg.open) adoptOpen(msg.protocol);
      break;
    case "adopt-open":
      adoptOpen(msg.protocol);
      break;
    case "frame":
      if (!adopt) break;
      if (adopt.ready) handleFrame(msg.data, adopt.zstd);
      else adopt.pending.push(msg.data);
      break;
    case "adopt-closed":
      // adoption is first-connection-only: the existing reconnect logic
      // takes over with a worker-owned socket
      if (adopt) {
        const { url, compress } = adopt;
        adopt = null;
        logDebug(
          "WS",
          `Disconnected adopted WebSocket, reconnecting in ${reconnectDelayMs}ms`,
        );
        handler.onConnectionChange({ type: "disconnected" });
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          void (async () => {
            connect(url, compress ? await zstdPromise : undefined);
          })();
        }, reconnectDelayMs);
      }
      break;
    case "disconnect":
      adopt = null;
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
        // main thread owns the adopted socket
        ctx.postMessage({
          type: "ws-send",
          data: JSON.stringify(msg.value),
        } satisfies FromWorkerControlMessage);
      } else if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg.value));
      } else {
        logWarning("WS", "Attempting to send on closed WebSocket", msg.value);
      }

      break;
  }
};
