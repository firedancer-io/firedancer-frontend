import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { adoptEarlyWs, closeEarlyWs, type EarlyWs } from "../earlyWs";
import { earlyWsWorkerMain, type EarlyWsWorkerScope } from "../earlyWsWorker";
import type { ToWorkerMessage } from "../types";

const wsUrl = "ws://validator:80/websocket";

/* ------------------- main thread half (earlyWs.ts) ------------------- */

class MockWorker {
  posted: { msg: unknown; transfer?: Transferable[] }[] = [];
  terminateCalls = 0;
  postMessage(msg: unknown, transfer?: Transferable[]) {
    this.posted.push({ msg, transfer });
  }
  terminate() {
    this.terminateCalls += 1;
  }
}

class FakeChannel {
  port1 = { name: "port1" } as unknown as MessagePort;
  port2 = { name: "port2" } as unknown as MessagePort;
}

interface Post {
  msg: ToWorkerMessage;
  transfer?: Transferable[];
}

function makePost() {
  const posts: Post[] = [];
  return {
    posts,
    post: (msg: ToWorkerMessage, transfer?: Transferable[]) =>
      posts.push({ msg, transfer }),
  };
}

function installEarly(overrides?: Partial<Omit<EarlyWs, "worker">>) {
  const worker = new MockWorker();
  window.__fdWsEarly = {
    worker: worker as unknown as Worker,
    url: wsUrl,
    compress: true,
    error: false,
    closed: false,
    ...overrides,
  };
  return worker;
}

beforeEach(() => {
  vi.stubGlobal("MessageChannel", FakeChannel);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  closeEarlyWs();
  delete window.__fdWsEarly;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("adoptEarlyWs", () => {
  test("wires a MessageChannel: port1 to the blob worker, port2 to wsWorker inside adopt", () => {
    const worker = installEarly();
    const { posts, post } = makePost();

    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);
    expect(window.__fdWsEarly).toBeUndefined();

    // blob worker receives its end of the channel, transferred
    expect(worker.posted).toHaveLength(1);
    const port1 = worker.posted[0].msg as MessagePort;
    expect(port1).toMatchObject({ name: "port1" });
    expect(worker.posted[0].transfer).toEqual([port1]);

    // wsWorker receives the far end inside the adopt message, transferred
    expect(posts).toHaveLength(1);
    expect(posts[0].msg).toEqual({
      type: "adopt",
      websocketUrl: wsUrl,
      compress: true,
      port: { name: "port2" },
    });
    expect(posts[0].transfer).toEqual([
      (posts[0].msg as { port: MessagePort }).port,
    ]);
    expect(worker.terminateCalls).toBe(0);
  });

  test.each([
    ["errored", { error: true }],
    ["closed", { closed: true }],
    ["url mismatch", { url: "ws://other:80/websocket" }],
    ["compress mismatch", { compress: false }],
  ] as const)("falls back when the early socket is %s", (_name, overrides) => {
    const worker = installEarly(overrides);
    const { posts, post } = makePost();

    expect(adoptEarlyWs(wsUrl, true, post)).toBe(false);
    expect(posts).toHaveLength(0);
    expect(worker.posted).toHaveLength(0);
    expect(window.__fdWsEarly).toBeUndefined();
    expect(worker.terminateCalls).toBe(1);
  });

  test("falls back when the early worker is missing or already taken", () => {
    const { posts, post } = makePost();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(false);
    expect(posts).toHaveLength(0);

    installEarly();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(false); // single-shot
    expect(posts).toHaveLength(1);
  });

  test("closeEarlyWs terminates the adopted worker exactly once", () => {
    const worker = installEarly();
    const { post } = makePost();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);

    closeEarlyWs();
    expect(worker.terminateCalls).toBe(1);
    closeEarlyWs();
    expect(worker.terminateCalls).toBe(1);
  });
});

/* --------------- blob worker half (earlyWsWorker.ts) --------------- */

class MockSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: MockSocket | undefined;
  readyState: number = MockSocket.CONNECTING;
  binaryType = "blob";
  protocol = "";
  sent: string[] = [];
  closeCalls = 0;
  onmessage: ((ev: MessageEvent<string | ArrayBuffer>) => unknown) | null =
    null;
  onopen: ((ev: Event) => unknown) | null = null;
  onclose: ((ev: CloseEvent) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    MockSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closeCalls += 1;
  }
}

class MockScope implements EarlyWsWorkerScope {
  onmessage: ((e: MessageEvent) => void) | null = null;
  statusPosts: string[] = [];
  closeCalls = 0;
  postMessage(msg: string) {
    this.statusPosts.push(msg);
  }
  close() {
    this.closeCalls += 1;
  }
}

class MockPort {
  posted: { msg: unknown; transfer?: Transferable[] }[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage(msg: unknown, transfer?: Transferable[]) {
    this.posted.push({ msg, transfer });
  }
  types() {
    return this.posted.map((p) => (p.msg as { type: string }).type);
  }
}

function startWorker(compress = true) {
  const scope = new MockScope();
  earlyWsWorkerMain(
    scope,
    MockSocket as unknown as typeof WebSocket,
    wsUrl,
    compress,
  );
  const socket = MockSocket.last!;
  return { scope, socket };
}

function openSocket(socket: MockSocket, protocol = "compress-zstd") {
  socket.readyState = MockSocket.OPEN;
  socket.protocol = protocol;
  socket.onopen?.(new Event("open"));
}

function receive(socket: MockSocket, data: string | ArrayBuffer) {
  socket.onmessage?.(new MessageEvent("message", { data }));
}

function adopt(scope: MockScope) {
  const port = new MockPort();
  scope.onmessage?.({ data: port } as MessageEvent);
  return port;
}

describe("earlyWsWorkerMain", () => {
  test("opens the socket with the compress-zstd offer and arraybuffer frames", () => {
    const { socket } = startWorker(true);
    expect(socket.url).toBe(wsUrl);
    expect(socket.protocols).toEqual(["compress-zstd"]);
    expect(socket.binaryType).toBe("arraybuffer");

    const { socket: plain } = startWorker(false);
    expect(plain.protocols).toBeUndefined();
  });

  test("pumps buffered then live frames in order over the port, no loss or duplication", () => {
    const { scope, socket } = startWorker();
    openSocket(socket);
    const buffered1 = "buffered-1";
    const buffered2 = new ArrayBuffer(4);
    receive(socket, buffered1);
    receive(socket, buffered2);

    const port = adopt(scope);

    // protocol first (socket already open), then the buffered frames,
    // ArrayBuffers transferred
    expect(port.posted[0].msg).toEqual({
      type: "adopt-open",
      protocol: "compress-zstd",
    });
    expect(port.posted[1].msg).toEqual({ type: "frame", data: buffered1 });
    expect(port.posted[1].transfer).toEqual([]);
    expect(port.posted[2].msg).toEqual({ type: "frame", data: buffered2 });
    expect(port.posted[2].transfer).toEqual([buffered2]);

    // live frames forwarded in arrival order
    const live1 = new ArrayBuffer(8);
    const live2 = "live-2";
    receive(socket, live1);
    receive(socket, live2);
    expect(port.posted).toHaveLength(5);

    // full sequence reconstructed without loss, duplication or reorder
    const seq = port.posted
      .slice(1)
      .map(({ msg }) => (msg as { data: string | ArrayBuffer }).data);
    expect(seq).toEqual([buffered1, buffered2, live1, live2]);
  });

  test("adopts a connecting socket and defers the protocol to adopt-open", () => {
    const { scope, socket } = startWorker();
    const port = adopt(scope);
    expect(port.posted).toHaveLength(0);

    openSocket(socket);
    expect(port.posted[0].msg).toEqual({
      type: "adopt-open",
      protocol: "compress-zstd",
    });

    receive(socket, "after-open");
    expect(port.posted[1].msg).toEqual({ type: "frame", data: "after-open" });
  });

  test("signals error and closed to the main thread before adoption", () => {
    const { scope, socket } = startWorker();
    socket.onerror?.(new Event("error"));
    expect(scope.statusPosts).toEqual(["error"]);
    socket.onclose?.(new CloseEvent("close"));
    expect(scope.statusPosts).toEqual(["error", "closed"]);
    expect(scope.closeCalls).toBe(0); // stays alive for a racing adoption
  });

  test("sends adopt-closed and exits when the adopted socket closes", () => {
    const { scope, socket } = startWorker();
    openSocket(socket);
    const port = adopt(scope);

    socket.onclose?.(new CloseEvent("close"));
    expect(port.types()).toEqual(["adopt-open", "adopt-closed"]);
    expect(scope.statusPosts).toEqual([]);
    expect(scope.closeCalls).toBe(1);
  });

  test("adoption racing a close still pumps frames then adopt-closed", () => {
    const { scope, socket } = startWorker();
    openSocket(socket);
    receive(socket, "frame-1");
    socket.readyState = MockSocket.CLOSED;
    socket.onclose?.(new CloseEvent("close"));

    // main thread adopted before observing the "closed" status message
    const port = adopt(scope);
    expect(port.types()).toEqual(["adopt-open", "frame", "adopt-closed"]);
    expect(scope.closeCalls).toBe(1);
  });

  test("relays ws-send to the socket when open, drops it otherwise", () => {
    const { scope, socket } = startWorker();
    openSocket(socket);
    const port = adopt(scope);

    port.onmessage?.({
      data: { type: "ws-send", data: '{"a":1}' },
    } as MessageEvent);
    expect(socket.sent).toEqual(['{"a":1}']);

    socket.readyState = MockSocket.CLOSING;
    port.onmessage?.({
      data: { type: "ws-send", data: "x" },
    } as MessageEvent);
    expect(socket.sent).toEqual(['{"a":1}']);
  });

  test("close-early closes the socket silently and ends the worker", () => {
    const { scope, socket } = startWorker();
    openSocket(socket);
    const port = adopt(scope);

    port.onmessage?.({ data: { type: "close-early" } } as MessageEvent);
    expect(socket.closeCalls).toBe(1);
    // handlers detached so no adopt-closed reaches wsWorker
    expect(socket.onmessage).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(port.types()).toEqual(["adopt-open"]);
    expect(scope.closeCalls).toBe(1);
  });
});
