import { ClientMessage, ConnectionStatus, SocketState } from "./types";
import { logDebug, logWarning } from "../../logger";

const RECONNECT_DELAY = 3_000;

let reconnectTimer: ReturnType<typeof setTimeout>;

export default function connectWebSocket(
  url: string | URL,
  onMessage: (message: unknown) => void,
  onConnectionStatusChanged: (connectionStatus: ConnectionStatus) => void,
) {
  let ws: WebSocket;
  let isDisposing = false;

  function connect() {
    logDebug("WS", `Connecting to API WebSocket ${url.toString()}`);
    onConnectionStatusChanged({ socketState: SocketState.Connecting });
    ws = new WebSocket(url);
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

    ws.onmessage = function onmessage(ev: MessageEvent<string>) {
      if (this !== ws || isDisposing) return;
      try {
        const json = JSON.parse(ev.data) as unknown;
        onMessage(json);
      } catch (e) {
        console.error(e);
        console.error(ev.data);
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
