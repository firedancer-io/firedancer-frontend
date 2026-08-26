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

const runningFrame = frame("summary", "boot_progress", { phase: "running" });
const catchingUpFrame = frame("summary", "boot_progress", {
  phase: "catching_up",
});
const liveShredsValue = {
  reference_slot: 100,
  reference_ts: "1000000000",
  slot_delta: [0],
  shred_idx: [0],
  event: [1],
  event_ts_delta: [5],
};
const liveShredsFrame = frame("slot", "live_shreds", liveShredsValue);

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

  const kvbKeys = () => {
    vi.advanceTimersByTime(33);
    return posted
      .filter((m): m is Kvb => m.type === "kvb")
      .flatMap((m) => m.items.map((i) => `${i.topic}:${i.key}`));
  };
  const pushFrame = (data: string) =>
    portMessage({ data: { type: "frame", data } });
  return { posted, kvbKeys, onmessage, pushFrame };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockReturnValue(0);
  window.onmessage = null;
});

afterEach(() => {
  window.onmessage = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("wsWorker live_shreds main-feed gate", () => {
  test("keeps posting live_shreds to main while the phase is unknown or booting", async () => {
    const unknown = await bootAdopted([liveShredsFrame]);
    expect(unknown.kvbKeys()).toContain("slot:live_shreds");

    const booting = await bootAdopted([catchingUpFrame, liveShredsFrame]);
    expect(booting.kvbKeys()).toContain("slot:live_shreds");
  });

  test("drops live_shreds from main kvbs once the phase is running", async () => {
    const { kvbKeys } = await bootAdopted([runningFrame, liveShredsFrame]);
    const keys = kvbKeys();
    expect(keys).toContain("summary:boot_progress");
    expect(keys).not.toContain("slot:live_shreds");
  });

  test("seeds a late-attaching chart port with the cached backlog, then streams", async () => {
    const { onmessage, pushFrame } = await bootAdopted([
      runningFrame,
      liveShredsFrame,
    ]);

    const chartPort = new MockPort();
    onmessage({
      data: {
        type: "shredsPort",
        port: chartPort as unknown as MessagePort,
      },
    });
    expect(chartPort.posted).toHaveLength(1);
    const seed = chartPort.posted[0] as {
      type: string;
      data: { slotsShreds?: { slots: Map<number, unknown> } };
    };
    expect(seed.type).toBe("seed");
    expect(seed.data.slotsShreds?.slots.has(100)).toBe(true);

    // live events after attach stream individually over the port
    pushFrame(liveShredsFrame);
    expect(chartPort.posted).toHaveLength(2);
    expect((chartPort.posted[1] as { type: string }).type).toBe("shreds");
  });

  test("mainShreds enable seeds main with the cache and reopens the kvb feed", async () => {
    const { posted, kvbKeys, onmessage } = await bootAdopted([
      runningFrame,
      liveShredsFrame,
    ]);
    expect(kvbKeys()).not.toContain("slot:live_shreds");

    onmessage({ data: { type: "mainShreds", enabled: true } });
    const seed = posted.find(
      (m): m is Extract<FromWorkerMessage, { type: "shredsSeed" }> =>
        m.type === "shredsSeed",
    );
    expect(seed).toBeDefined();
    expect(seed?.data.slotsShreds?.slots.has(100)).toBe(true);
  });
});
