import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  adoptEarlyWs,
  closeEarlyWs,
  handleEarlyWsMessage,
  type EarlyWs,
} from "../earlyWs";
import type { EarlyWsFrame, ToWorkerMessage } from "../types";

const wsUrl = "ws://validator:80/websocket";

class MockSocket {
  readyState: number = WebSocket.OPEN;
  protocol = "";
  sent: string[] = [];
  closeCalls = 0;
  onmessage: ((ev: MessageEvent<EarlyWsFrame>) => unknown) | null = null;
  onopen: ((ev: Event) => unknown) | null = null;
  onclose: ((ev: CloseEvent) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closeCalls += 1;
  }
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

function installEarly(overrides?: Partial<Omit<EarlyWs, "socket">>) {
  const socket = new MockSocket();
  socket.protocol = "compress-zstd";
  window.__fdWsEarly = {
    socket: socket as unknown as WebSocket,
    url: wsUrl,
    compress: true,
    frames: [],
    error: false,
    closed: false,
    ...overrides,
  };
  return socket;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  closeEarlyWs();
  delete window.__fdWsEarly;
  vi.restoreAllMocks();
});

describe("adoptEarlyWs", () => {
  test("adopts an open socket: buffered then live frames arrive in order, no loss or duplication", () => {
    const socket = installEarly();
    const buffered1 = "buffered-1";
    const buffered2 = new ArrayBuffer(4);
    window.__fdWsEarly?.frames.push(buffered1, buffered2);
    const { posts, post } = makePost();

    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);
    expect(window.__fdWsEarly).toBeUndefined();

    // adopt message carries the buffered frames, transfers ArrayBuffers
    expect(posts).toHaveLength(1);
    expect(posts[0].msg).toEqual({
      type: "adopt",
      websocketUrl: wsUrl,
      compress: true,
      open: true,
      protocol: "compress-zstd",
      frames: [buffered1, buffered2],
    });
    expect(posts[0].transfer).toEqual([buffered2]);

    // live frames forwarded in arrival order
    const live1 = new ArrayBuffer(8);
    const live2 = "live-2";
    socket.onmessage?.(new MessageEvent("message", { data: live1 }));
    socket.onmessage?.(new MessageEvent("message", { data: live2 }));
    expect(posts).toHaveLength(3);
    expect(posts[1].msg).toEqual({ type: "frame", data: live1 });
    expect(posts[1].transfer).toEqual([live1]);
    expect(posts[2].msg).toEqual({ type: "frame", data: live2 });
    expect(posts[2].transfer).toBeUndefined();

    // full sequence reconstructed without loss, duplication or reorder
    const adoptMsg = posts[0].msg;
    const seq = [
      ...(adoptMsg.type === "adopt" ? adoptMsg.frames : []),
      ...posts
        .slice(1)
        .map(({ msg }) => (msg.type === "frame" ? msg.data : undefined)),
    ];
    expect(seq).toEqual([buffered1, buffered2, live1, live2]);
  });

  test("adopts a connecting socket and defers the protocol to adopt-open", () => {
    const socket = installEarly();
    socket.readyState = WebSocket.CONNECTING;
    socket.protocol = "";
    const { posts, post } = makePost();

    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);
    expect(posts[0].msg).toMatchObject({
      type: "adopt",
      open: false,
      frames: [],
    });

    socket.readyState = WebSocket.OPEN;
    socket.protocol = "compress-zstd";
    socket.onopen?.(new Event("open"));
    expect(posts[1].msg).toEqual({
      type: "adopt-open",
      protocol: "compress-zstd",
    });

    socket.onmessage?.(new MessageEvent("message", { data: "after-open" }));
    expect(posts[2].msg).toEqual({ type: "frame", data: "after-open" });
  });

  test("notifies the worker when the adopted socket closes", () => {
    const socket = installEarly();
    const { posts, post } = makePost();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);

    socket.onclose?.(new CloseEvent("close"));
    expect(posts[1].msg).toEqual({ type: "adopt-closed" });

    // after close, sends are dropped with a warning instead of throwing
    expect(handleEarlyWsMessage({ type: "ws-send", data: "x" })).toBe(true);
    expect(socket.sent).toEqual([]);
  });

  test.each([
    ["errored", { error: true }],
    ["closed", { closed: true }],
    ["url mismatch", { url: "ws://other:80/websocket" }],
    ["compress mismatch", { compress: false }],
  ] as const)("falls back when the early socket is %s", (_name, overrides) => {
    const socket = installEarly(overrides);
    const { posts, post } = makePost();

    expect(adoptEarlyWs(wsUrl, true, post)).toBe(false);
    expect(posts).toHaveLength(0);
    expect(window.__fdWsEarly).toBeUndefined();
    expect(socket.closeCalls).toBe(1);
  });

  test("falls back when the early socket is missing or already taken", () => {
    const { posts, post } = makePost();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(false);
    expect(posts).toHaveLength(0);

    installEarly();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(false); // single-shot
    expect(posts).toHaveLength(1);
  });

  test("falls back when the early socket readyState is not CONNECTING/OPEN", () => {
    const socket = installEarly();
    socket.readyState = WebSocket.CLOSED;
    const { posts, post } = makePost();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(false);
    expect(posts).toHaveLength(0);
  });
});

describe("handleEarlyWsMessage", () => {
  test("routes ws-send to the adopted socket when open", () => {
    const socket = installEarly();
    const { post } = makePost();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);

    expect(handleEarlyWsMessage({ type: "ws-send", data: '{"a":1}' })).toBe(
      true,
    );
    expect(socket.sent).toEqual(['{"a":1}']);
  });

  test("drops ws-send with a warning when the adopted socket is not open", () => {
    const socket = installEarly();
    const { post } = makePost();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);

    socket.readyState = WebSocket.CLOSING;
    expect(handleEarlyWsMessage({ type: "ws-send", data: "x" })).toBe(true);
    expect(socket.sent).toEqual([]);
  });

  test("close-early closes the socket silently and disables further sends", () => {
    const socket = installEarly();
    const { posts, post } = makePost();
    expect(adoptEarlyWs(wsUrl, true, post)).toBe(true);

    expect(handleEarlyWsMessage({ type: "close-early" })).toBe(true);
    expect(socket.closeCalls).toBe(1);
    // handlers detached so no adopt-closed reaches the worker
    expect(socket.onmessage).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(posts).toHaveLength(1);

    expect(handleEarlyWsMessage({ type: "ws-send", data: "x" })).toBe(true);
    expect(socket.sent).toEqual([]);
  });

  test("passes worker pipeline messages through untouched", () => {
    expect(handleEarlyWsMessage({ type: "connected" })).toBe(false);
    expect(handleEarlyWsMessage({ type: "kvb", items: [] })).toBe(false);
  });
});
