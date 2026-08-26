/**
 * Body of the early-WebSocket worker that the index.html inline script
 * spawns from a Blob URL (vite.config.ts inlines
 * `(${earlyWsWorkerMain.toString()})(self,WebSocket,u,compress)`), so
 * the socket opens and frames are consumed off the main thread while
 * the bundle fetches and evaluates. At adoption the main thread
 * transfers in a MessagePort (earlyWs.ts) whose far end is held by
 * wsWorker; from then on this worker pumps buffered then live frames
 * over the port and relays "ws-send"/"close-early" requests
 * (EarlyPortMessage/EarlyPortRequest in types.ts), keeping the main
 * thread out of the data path entirely. Stringified at build time, so
 * it must not reference imports or the enclosing module scope.
 */

export interface EarlyWsWorkerScope {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(msg: string): void;
  close(): void;
}

export function earlyWsWorkerMain(
  self: EarlyWsWorkerScope,
  WS: typeof WebSocket,
  url: string,
  compress: boolean,
) {
  const socket = compress ? new WS(url, ["compress-zstd"]) : new WS(url);
  socket.binaryType = "arraybuffer";
  let frames: (string | ArrayBuffer)[] = [];
  let port: MessagePort | null = null;
  let opened = false;
  let closed = false;

  const postFrame = (p: MessagePort, data: string | ArrayBuffer) => {
    p.postMessage(
      { type: "frame", data },
      data instanceof ArrayBuffer ? [data] : [],
    );
  };

  socket.onmessage = (m: MessageEvent<string | ArrayBuffer>) => {
    if (port) postFrame(port, m.data);
    else frames.push(m.data);
  };
  // socket.protocol is only known once open; defer it to adopt-open
  socket.onopen = () => {
    opened = true;
    if (port)
      port.postMessage({ type: "adopt-open", protocol: socket.protocol });
  };
  // pre-adoption the main thread tracks error/closed on the handle to
  // decide adoption; once adopted only adopt-closed matters (close
  // always follows error)
  socket.onerror = () => {
    if (!port) self.postMessage("error");
  };
  socket.onclose = () => {
    closed = true;
    if (port) {
      port.postMessage({ type: "adopt-closed" });
      self.close();
    } else {
      self.postMessage("closed");
    }
  };

  // adoption: the sole main-thread message is the port to wsWorker
  self.onmessage = (e: MessageEvent) => {
    const p = e.data as MessagePort;
    port = p;
    p.onmessage = (pe: MessageEvent) => {
      const pm = pe.data as
        | { type: "ws-send"; data: string }
        | { type: "close-early" };
      if (pm.type === "ws-send") {
        if (socket.readyState === WS.OPEN) socket.send(pm.data);
        else console.warn("[WS] Attempting to send on closed WebSocket");
      } else {
        // close-early: drop the socket silently (zstd-init fallback)
        socket.onmessage = null;
        socket.onopen = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close();
        } catch {
          // already closed
        }
        self.close();
      }
    };
    // pump what happened before adoption, in event order
    if (opened)
      p.postMessage({ type: "adopt-open", protocol: socket.protocol });
    const buffered = frames;
    frames = [];
    for (const f of buffered) postFrame(p, f);
    if (closed) {
      p.postMessage({ type: "adopt-closed" });
      self.close();
    }
  };
}
