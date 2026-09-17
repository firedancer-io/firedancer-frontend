import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FromWorkerMessage, ToWorkerMessage, WsEntity } from "../types";

vi.mock("@oneidentity/zstd-js/decompress", () => ({ ZstdInit: vi.fn() }));
vi.mock("../../../logger", () => ({
  logDebug: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
}));
vi.mock("../types", () => ({
  WsMessageSchema: {
    safeParse: (data: WsEntity) => ({ success: true, data }),
  },
}));
vi.mock("../messageHandler", () => ({
  createMessageHandler: (post: (msg: FromWorkerMessage) => void) => ({
    onMessage: vi.fn(),
    onConnectionChange: post,
  }),
}));

const emptyPeers: WsEntity = {
  topic: "peers",
  key: "update",
  value: { add: [] },
};
const identity: WsEntity = {
  topic: "summary",
  key: "identity_key",
  value: "11111111111111111111111111111111",
};

let sockets: MockWebSocket[];

class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  binaryType = "blob";
  onopen: WebSocket["onopen"] = null;
  onclose: WebSocket["onclose"] = null;
  onmessage: WebSocket["onmessage"] = null;
  send = vi.fn();
  close = vi.fn(() => this.closed());

  constructor(public url: string) {
    sockets.push(this);
  }

  opened() {
    this.onopen?.call(this as unknown as WebSocket, new Event("open"));
  }

  closed() {
    this.onclose?.call(this as unknown as WebSocket, new CloseEvent("close"));
  }

  receive(item: WsEntity) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      new MessageEvent("message", { data: JSON.stringify(item) }),
    );
  }
}

const ctx = {
  onmessage: null as ((event: MessageEvent<ToWorkerMessage>) => void) | null,
  postMessage: vi.fn<(message: FromWorkerMessage) => void>(),
};

function send(message: ToWorkerMessage) {
  ctx.onmessage?.(new MessageEvent("message", { data: message }));
}

function connect() {
  send({ type: "connect", websocketUrl: "ws://localhost", compress: false });
  return sockets[sockets.length - 1];
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  sockets = [];
  ctx.onmessage = null;
  ctx.postMessage.mockReset();
  vi.stubGlobal("self", ctx);
  vi.stubGlobal("WebSocket", MockWebSocket);
  await import("../wsWorker");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("worker websocket batch lifecycle", () => {
  it("preserves normal 32ms batching and subsequent batches", () => {
    const socket = connect();
    socket.opened();
    ctx.postMessage.mockClear();
    socket.receive(emptyPeers);
    socket.receive(identity);
    vi.advanceTimersByTime(31);
    expect(ctx.postMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ctx.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "kvb",
      items: [emptyPeers, identity],
    });
    socket.receive(emptyPeers);
    vi.advanceTimersByTime(32);
    expect(ctx.postMessage).toHaveBeenCalledTimes(2);
    expect(ctx.postMessage).toHaveBeenLastCalledWith({
      type: "kvb",
      items: [emptyPeers],
    });
  });

  it("cancels batches before notifying close and sends only the new stream after reconnect", () => {
    const old = connect();
    old.receive(identity);
    ctx.postMessage.mockClear();
    ctx.postMessage.mockImplementation((message) => {
      if (message.type === "disconnected") expect(vi.getTimerCount()).toBe(0);
    });
    old.closed();
    expect(ctx.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "disconnected",
    });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(32);
    expect(ctx.postMessage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_000 - 32);
    const current = sockets[1];
    expect(current).toBeDefined();
    current.opened();
    ctx.postMessage.mockClear();
    old.receive(identity);
    old.opened();
    old.closed();
    current.receive(emptyPeers);
    vi.advanceTimersByTime(32);
    expect(ctx.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "kvb",
      items: [emptyPeers],
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an existing batch before a new connecting notification", () => {
    const old = connect();
    old.receive(identity);
    ctx.postMessage.mockClear();
    ctx.postMessage.mockImplementation((message) => {
      if (message.type === "connecting") expect(vi.getTimerCount()).toBe(0);
    });
    const current = connect();
    expect(ctx.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "connecting",
    });
    old.receive(identity);
    old.closed();
    current.receive(emptyPeers);
    vi.advanceTimersByTime(32);
    expect(ctx.postMessage).toHaveBeenLastCalledWith({
      type: "kvb",
      items: [emptyPeers],
    });
    expect(ctx.postMessage).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels batches and reconnect timers on explicit disconnect even with synchronous close", () => {
    const socket = connect();
    socket.receive(emptyPeers);
    ctx.postMessage.mockClear();
    send({ type: "disconnect" });
    expect(socket.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    socket.receive(identity);
    vi.advanceTimersByTime(3_000);
    expect(ctx.postMessage).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(1);

    const current = connect();
    current.closed();
    expect(vi.getTimerCount()).toBe(1);
    send({ type: "disconnect" });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(3_000);
    expect(sockets).toHaveLength(2);
  });
});
