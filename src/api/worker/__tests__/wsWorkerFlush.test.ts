import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FromWorkerMessage, ToWorkerMessage } from "../types";

// wsWorker fires ZstdInit at module load; adopt-open with an empty
// protocol never awaits it, so resolving undefined keeps decode plain
vi.mock("@oneidentity/zstd-js/decompress", () => ({
  ZstdInit: () => Promise.resolve(undefined),
}));

const wsUrl = "ws://validator:80/websocket";

class MockPort {
  onmessage: ((e: MessageEvent) => void) | null = null;
  posted: unknown[] = [];
  postMessage(msg: unknown) {
    this.posted.push(msg);
  }
  close() {}
}

const frame = (topic: string, key: string, value: unknown) =>
  JSON.stringify({ topic, key, value });

// large enough to cross the worker's largeFrameBytes (256KiB) threshold
const bigFrame = frame(
  "slot",
  "skipped_history",
  Array.from({ length: 40_000 }, (_, i) => 300_000_000 + i),
);

type Kvb = Extract<FromWorkerMessage, { type: "kvb" }>;

async function bootAdopted(pending: string[]) {
  vi.resetModules();
  const posted: FromWorkerMessage[] = [];
  vi.stubGlobal(
    "postMessage",
    (msg: FromWorkerMessage) => void posted.push(msg),
  );
  await import("../wsWorker");

  const port = new MockPort();
  const onmessage = window.onmessage as unknown as (e: {
    data: ToWorkerMessage;
  }) => void;
  onmessage({
    data: {
      type: "adopt",
      websocketUrl: wsUrl,
      compress: false,
      port: port as unknown as MessagePort,
    },
  });
  const portMessage = port.onmessage as unknown as (e: {
    data: unknown;
  }) => void;
  for (const data of pending) portMessage({ data: { type: "frame", data } });
  // empty protocol: adoptOpen drains synchronously, no zstd await
  portMessage({ data: { type: "adopt-open", protocol: "" } });

  const kvbs = () => posted.filter((m): m is Kvb => m.type === "kvb");
  return { posted, kvbs };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.onmessage = null;
});

afterEach(() => {
  window.onmessage = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("wsWorker backlog drain flush ordering", () => {
  test("flushes the decoded small frames before decoding a large frame", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0); // size trigger only
    const { kvbs } = await bootAdopted([
      frame("summary", "version", "v1"),
      frame("summary", "commit_hash", "abc"),
      bigFrame,
      frame("summary", "version", "v2"),
    ]);

    // early flush posted synchronously during the drain, before the
    // trailing 32ms timer had any chance to run
    expect(kvbs()).toHaveLength(1);
    expect(
      kvbs()[0].items.map(({ topic, key, value }) => [topic, key, value]),
    ).toEqual([
      ["summary", "version", "v1"],
      ["summary", "commit_hash", "abc"],
    ]);

    vi.advanceTimersByTime(33);
    expect(kvbs()).toHaveLength(2);
    expect(kvbs()[1].items.map(({ key }) => key)).toEqual([
      "skipped_history",
      "version",
    ]);

    // no loss or duplication, per-key arrival order preserved across
    // the early-flush batch boundary
    const all = kvbs().flatMap((m) => m.items);
    expect(all).toHaveLength(4);
    expect(all.filter((i) => i.key === "version").map((i) => i.value)).toEqual([
      "v1",
      "v2",
    ]);
  });

  test("does not flush empty: a leading large frame starts the first batch", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { kvbs } = await bootAdopted([
      bigFrame,
      frame("summary", "version", "v1"),
    ]);

    expect(kvbs()).toHaveLength(0); // nothing decoded yet to flush early
    vi.advanceTimersByTime(33);
    expect(kvbs()).toHaveLength(1);
    expect(kvbs()[0].items.map(({ key }) => key)).toEqual([
      "skipped_history",
      "version",
    ]);
  });

  test("small-only backlog keeps the single batched flush", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { kvbs } = await bootAdopted([
      frame("summary", "version", "v1"),
      frame("summary", "commit_hash", "abc"),
    ]);

    expect(kvbs()).toHaveLength(0);
    vi.advanceTimersByTime(33);
    expect(kvbs()).toHaveLength(1);
    expect(kvbs()[0].items.map(({ key }) => key)).toEqual([
      "version",
      "commit_hash",
    ]);
  });

  test("time backstop flushes a long decode run even without large frames", async () => {
    // every performance.now() call advances 300ms, so at each frame the
    // pending batch is already past the 250ms starvation backstop and
    // ships
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (now += 300));
    const { kvbs } = await bootAdopted([
      frame("summary", "version", "v1"),
      frame("summary", "version", "v2"),
      frame("summary", "version", "v3"),
    ]);

    expect(kvbs()).toHaveLength(2); // v1 and v2 shipped mid-drain
    vi.advanceTimersByTime(33);
    const batches = kvbs().map((m) => m.items.map((i) => i.value));
    expect(batches).toEqual([["v1"], ["v2"], ["v3"]]);
  });
});
