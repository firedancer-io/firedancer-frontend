import type { ClientMessage, ConnectionStatus } from "./types";
import { SocketState } from "./types";
import { logDebug, logWarning } from "../../logger";
import type { ZstdDec } from "@oneidentity/zstd-js/decompress";

const RECONNECT_DELAY = 3_000;

const VITE_WEBSOCKET_COMPRESS = (
  import.meta.env.VITE_WEBSOCKET_COMPRESS as string
)?.trim();

let reconnectTimer: ReturnType<typeof setTimeout>;

export default function connectWebSocket(
  url: string | URL,
  onMessage: (message: unknown) => void,
  onConnectionStatusChanged: (connectionStatus: ConnectionStatus) => void,
  zstd: ZstdDec,
) {
  let ws: WebSocket;
  let isDisposing = false;

  function connect() {
    logDebug("WS", `Connecting to API WebSocket ${url.toString()}`);
    onConnectionStatusChanged({ socketState: SocketState.Connecting });
    ws = new WebSocket(
      url,
      VITE_WEBSOCKET_COMPRESS === "false" ? undefined : ["compress-zstd"],
    );
    ws.binaryType = "arraybuffer";

    ws.onopen = function onopen() {
      if (this !== ws || isDisposing) return;

      logDebug("WS", "Connected to API WebSocket");
      onConnectionStatusChanged({ socketState: SocketState.Connected });
    };

    ws.onclose = function onclose() {
      if (this !== ws || isDisposing) return;

      logDebug(
        "WS",
        `Disconnected API WebSocket, reconnecting in ${RECONNECT_DELAY}ms`,
      );
      onConnectionStatusChanged({ socketState: SocketState.Disconnected });

      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
    };

    const decoder = new TextDecoder();
    ws.onmessage = function onmessage(ev: MessageEvent<unknown>) {
      if (this !== ws || isDisposing || !zstd) return;
      try {
        const message = ev.data;
        let json = undefined;
        if (typeof message === "string") {
          json = JSON.parse(message) as unknown;
        } else if (message instanceof ArrayBuffer) {
          json = JSON.parse(
            decoder.decode(zstd.ZstdStream.decompress(new Uint8Array(message))),
          ) as unknown;
        }
        onMessage(json);
      } catch (e) {
        console.error(e);
      }
    };
  }

  connect();

  function sendMessage(message: ClientMessage) {
    if (isDisposing) {
      logDebug("WS", "Attempting to send after disposing", message);
      return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      logWarning("WS", "Attempting to send on closed WebSocket", message);
    }
  }

  function dispose() {
    if (isDisposing) {
      logDebug("WS", "Dispose called after disposing");
      return;
    }

    isDisposing = true;
    logDebug("WS", "Closing API WebSocket");
    onConnectionStatusChanged({ socketState: SocketState.Disconnected });

    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;

    ws.close();
  }

  return [sendMessage, dispose] as const;
}
