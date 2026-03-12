import { ZstdInit, type ZstdDec } from "@oneidentity/zstd-js/decompress";
import { logDebug, logError, logWarning } from "../../logger";
import { WsMessageSchema, type WsEntity, type ToWorkerMessage } from "./types";
import { createMessageHandler } from "./messageHandler";

const reconnectDelayMs = 3_000;
const flushDelayMs = 32; // ~30fps

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout>;

let scheduled = false;
const pendingBatches = new Map<string, WsEntity[]>();

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
  ctx.postMessage({ type: "connecting" });
  ws = new WebSocket(url, zstd ? ["compress-zstd"] : undefined);
  ws.binaryType = "arraybuffer";

  ws.onopen = function onopen() {
    if (this !== ws) return;

    logDebug("WS", "Connected to API WebSocket");
    ctx.postMessage({ type: "connected" });
  };

  ws.onclose = function onclose() {
    if (this !== ws) return;

    logDebug(
      "WS",
      `Disconnected API WebSocket, reconnecting in ${reconnectDelayMs}ms`,
    );
    ctx.postMessage({ type: "disconnected" });

    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(url, zstd), reconnectDelayMs);
  };

  const decoder = new TextDecoder();
  ws.onmessage = function onmessage(ev: MessageEvent<unknown>) {
    if (this !== ws) return;
    try {
      const message = ev.data;
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
        if (!result.success) {
          logDebug("zod", json);
          logDebug("Zod", result.error.message);
          logDebug("Zod", result.error.issues);
          return;
        }

        enqueue(result.data);
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
        let zstd: ZstdDec | undefined;
        if (msg.compress) {
          try {
            zstd = await ZstdInit();
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
