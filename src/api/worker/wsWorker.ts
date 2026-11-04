import { logDebug, logError, logWarning } from "../../logger";
import {
  WsMessageSchema,
  WsErrorSchema,
  type WsEntity,
  type ToWorkerMessage,
} from "./types";
import { createMessageHandler } from "./messageHandler";
import { loadZstd, type ZstdDecoder } from "./zstd/zstd";

const reconnectDelayMs = 3_000;
const flushDelayMs = 32; // ~30fps

const transferableKeys: WsEntity["key"][] = [
  "query_tile_states",
  "query_shreds",
];

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

function collectTransferables(item: WsEntity, transfer: Transferable[]) {
  if (!transferableKeys.includes(item.key) || item.value == null) return;
  for (const v of Object.values(item.value)) {
    if (ArrayBuffer.isView(v)) transfer.push(v.buffer);
  }
}

function flush() {
  scheduled = false;
  const items: WsEntity[] = [];
  const transfer: Transferable[] = [];
  for (const batch of pendingBatches.values()) {
    for (const item of batch) {
      items.push(item);
      collectTransferables(item, transfer);
    }
  }
  pendingBatches.clear();

  if (items.length) {
    // latest kv type not implemented as everything defaults to batched kvb
    ctx.postMessage({ type: "kvb", items }, transfer);
  }
}

function connect(url: string, zstd: ZstdDecoder | undefined) {
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
    try {
      const message = ev.data;
      let json = undefined;
      if (typeof message === "string") {
        json = JSON.parse(message) as unknown;
      } else if (message instanceof ArrayBuffer && zstd) {
        json = JSON.parse(
          zstd.decompressText(new Uint8Array(message)),
        ) as unknown;
      }

      if (json !== undefined) {
        const result = WsMessageSchema.safeParse(json);

        if (result.success) {
          enqueue(result.data);
          return;
        }

        const errorResult = WsErrorSchema.safeParse(json);
        if (errorResult.success) {
          ctx.postMessage({ type: "error", ...errorResult.data });
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
  };
}

ctx.onmessage = (e: MessageEvent<ToWorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case "connect":
      void (async () => {
        let zstd: ZstdDecoder | undefined;
        if (msg.compress) {
          try {
            zstd = await loadZstd();
          } catch (e) {
            logError(
              "WS",
              "Failed to initialize Zstd, falling back to uncompressed",
              e,
            );
          }
        }
        connect(msg.websocketUrl, zstd);
      })();
      break;
    case "disconnect":
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
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg.value));
      } else {
        logWarning("WS", "Attempting to send on closed WebSocket", msg.value);
      }

      break;
  }
};
