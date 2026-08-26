import { logWarning } from "../../logger";
import type {
  EarlyWsFrame,
  FromWorkerControlMessage,
  FromWorkerMessage,
  ToWorkerMessage,
} from "./types";

/** Socket opened by the index.html inline script (Firedancer builds) */
export interface EarlyWs {
  socket: WebSocket;
  url: string;
  compress: boolean;
  frames: EarlyWsFrame[];
  error: boolean;
  closed: boolean;
}

declare global {
  interface Window {
    __fdWsEarly?: EarlyWs;
  }
}

let adopted: WebSocket | null = null;

/**
 * Adopt the socket opened by the index.html inline script. The main
 * thread keeps ownership: buffered frames go to the worker in an
 * "adopt" message and the buffering onmessage is swapped for a
 * forwarder in the same task, so no frame is lost, duplicated or
 * reordered. Returns false when there is no usable early socket (or it
 * doesn't match the app's connection parameters); the caller then has
 * the worker connect exactly as before.
 */
export function adoptEarlyWs(
  url: string,
  compress: boolean,
  post: (msg: ToWorkerMessage, transfer?: Transferable[]) => void,
): boolean {
  const early = window.__fdWsEarly;
  if (!early) return false;
  delete window.__fdWsEarly; // adoption is first-connection-only

  const { socket } = early;
  if (
    early.error ||
    early.closed ||
    early.url !== url ||
    early.compress !== compress ||
    (socket.readyState !== WebSocket.CONNECTING &&
      socket.readyState !== WebSocket.OPEN)
  ) {
    try {
      socket.close();
    } catch {
      // already closed
    }
    return false;
  }

  adopted = socket;
  socket.onmessage = (e: MessageEvent<EarlyWsFrame>) => {
    post(
      { type: "frame", data: e.data },
      e.data instanceof ArrayBuffer ? [e.data] : undefined,
    );
  };
  // socket.protocol is only known once open; defer it to adopt-open
  socket.onopen = () => post({ type: "adopt-open", protocol: socket.protocol });
  socket.onerror = null; // close always follows error
  socket.onclose = () => {
    adopted = null;
    post({ type: "adopt-closed" });
  };
  post(
    {
      type: "adopt",
      websocketUrl: url,
      compress,
      open: socket.readyState === WebSocket.OPEN,
      protocol: socket.protocol,
      frames: early.frames,
    },
    early.frames.filter((f) => f instanceof ArrayBuffer),
  );
  return true;
}

/** Handles adopt-mode requests from the worker; true when consumed */
export function handleEarlyWsMessage(
  msg: FromWorkerMessage | FromWorkerControlMessage,
): msg is FromWorkerControlMessage {
  if (msg.type === "ws-send") {
    if (adopted && adopted.readyState === WebSocket.OPEN) {
      adopted.send(msg.data);
    } else {
      logWarning("WS", "Attempting to send on closed WebSocket", msg.data);
    }
    return true;
  }
  if (msg.type === "close-early") {
    closeEarlyWs();
    return true;
  }
  return false;
}

/** Close the adopted socket without notifying the worker */
export function closeEarlyWs() {
  if (!adopted) return;
  const socket = adopted;
  adopted = null;
  socket.onmessage = null;
  socket.onopen = null;
  socket.onclose = null;
  try {
    socket.close();
  } catch {
    // already closed
  }
}
