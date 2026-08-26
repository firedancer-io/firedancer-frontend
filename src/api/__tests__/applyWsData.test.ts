import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Peer } from "../types";
import type { WsEntity } from "../worker/types";

// Fresh module state (peers first-flush flag, buffers, throttles) per
// test; atoms and the default store reload with the same registry
// generation, so dynamic imports keep instances consistent
async function boot() {
  vi.resetModules();
  const applyWsData = await import("../applyWsData");
  const apiAtoms = await import("../atoms");
  const rootAtoms = await import("../../atoms");
  const wsAtoms = await import("../ws/atoms");
  const { getDefaultStore } = await import("jotai");
  return {
    ...applyWsData,
    apiAtoms,
    rootAtoms,
    wsAtoms,
    store: getDefaultStore(),
  };
}

const makePeer = (key: string) =>
  ({
    identity_pubkey: key,
    gossip: null,
    vote: [],
    info: null,
  }) as unknown as Peer;

const kvb = (items: WsEntity[]) => ({ type: "kvb" as const, items });

let rafCbs: FrameRequestCallback[];

beforeEach(() => {
  rafCbs = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCbs.push(cb);
    return rafCbs.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // leave rAF to the stub above (vitest fakes it by default)
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
    ],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function runRafs() {
  const cbs = rafCbs;
  rafCbs = [];
  for (const cb of cbs) cb(performance.now());
}

describe("applyWorkerMessage (module-level, no React)", () => {
  test("applies a kvb synchronously into the default store", async () => {
    const { applyWorkerMessage, apiAtoms, wsAtoms, store } = await boot();

    expect(store.get(wsAtoms.firstFlushAppliedAtom)).toBe(false);
    applyWorkerMessage(
      kvb([
        { topic: "summary", key: "version", value: "0.505.20216" },
        { topic: "summary", key: "cluster", value: "testnet" },
        {
          topic: "summary",
          key: "estimated_tps",
          value: {
            total: 5000,
            vote: 3000,
            success: 1900,
            failed: 100,
          },
        },
      ]),
    );

    expect(store.get(apiAtoms.versionAtom)).toBe("0.505.20216");
    expect(store.get(apiAtoms.clusterAtom)).toBe("testnet");
    // throttled sink fires on its leading edge for the first batch
    expect(store.get(apiAtoms.estimatedTpsAtom)).toEqual({
      total: 5000,
      vote: 3000,
      success: 1900,
      failed: 100,
    });
    expect(store.get(wsAtoms.firstFlushAppliedAtom)).toBe(true);
  });

  test("socket state messages apply without a mounted hook", async () => {
    const { applyWorkerMessage, wsAtoms, store } = await boot();
    const { SocketState } = await import("../ws/types");

    applyWorkerMessage({ type: "connected" });
    expect(store.get(wsAtoms.socketStateAtom)).toBe(SocketState.Connected);
    expect(store.get(wsAtoms.firstFlushAppliedAtom)).toBe(false);
  });

  test("first peers update yields to the next paint; stats and leaders apply immediately", async () => {
    const { applyWorkerMessage, rootAtoms, store } = await boot();

    applyWorkerMessage(
      kvb([
        {
          topic: "peers",
          key: "stats",
          value: {
            validator_count: 42,
            rpc_count: 7,
            active_stake: 100n,
            delinquent_stake: 5n,
          },
        },
        {
          topic: "peers",
          key: "update",
          value: { add: [makePeer("A"), makePeer("B")] },
        },
      ]),
    );

    // immediate: aggregate stats, deferred: the buffered peers apply
    expect(store.get(rootAtoms.serverPeerStatsAtom)).toEqual({
      validatorCount: 42,
      rpcCount: 7,
      activeStake: 100n,
      delinquentStake: 5n,
    });
    expect(Object.keys(store.get(rootAtoms.peersAtom))).toEqual([]);

    // rAF -> timeout(0): lands right after the first paint
    runRafs();
    expect(Object.keys(store.get(rootAtoms.peersAtom))).toEqual([]);
    vi.advanceTimersByTime(0);
    expect(Object.keys(store.get(rootAtoms.peersAtom)).sort()).toEqual([
      "A",
      "B",
    ]);
  });

  test("later peers updates flow through the debounced buffer", async () => {
    const { applyWorkerMessage, rootAtoms, store } = await boot();

    applyWorkerMessage(
      kvb([{ topic: "peers", key: "update", value: { add: [makePeer("A")] } }]),
    );
    runRafs();
    vi.advanceTimersByTime(0);
    expect(Object.keys(store.get(rootAtoms.peersAtom))).toEqual(["A"]);

    applyWorkerMessage(
      kvb([{ topic: "peers", key: "update", value: { add: [makePeer("B")] } }]),
    );
    // debounced 1s: nothing yet
    expect(Object.keys(store.get(rootAtoms.peersAtom))).toEqual(["A"]);
    vi.advanceTimersByTime(1_000);
    expect(Object.keys(store.get(rootAtoms.peersAtom)).sort()).toEqual([
      "A",
      "B",
    ]);
  });
});

describe("useWsWorker pre-mount pipeline", () => {
  test("the first kvb applies on arrival with no listener; trailing batches wait for one", async () => {
    vi.resetModules();

    // parked wsWorker handle as the index.html inline script leaves it
    const fakeWorker = {
      onmessage: null as ((e: unknown) => void) | null,
      postMessage: () => {},
      terminate: () => {},
    };
    const fakeEarly = { postMessage: () => {}, terminate: () => {} };
    vi.stubGlobal(
      "Worker",
      class {
        postMessage() {}
        terminate() {}
      },
    );

    const consts = await import("../consts");
    window.__fdWsMain = {
      worker: fakeWorker as unknown as Worker,
      early: fakeEarly as unknown as Worker,
      url: consts.websocketUrl,
      compress: consts.websocketCompress,
      error: false,
      pending: [
        { data: { type: "connected" } },
        {
          data: kvb([{ topic: "summary", key: "version", value: "first" }]),
        },
        {
          data: kvb([
            { topic: "summary", key: "cluster", value: "development" },
          ]),
        },
      ],
    };

    // module import runs startWorker, which attaches and drains pending
    await import("../worker/useWsWorker");
    const apiAtoms = await import("../atoms");
    const wsAtoms = await import("../ws/atoms");
    const { SocketState } = await import("../ws/types");
    const { getDefaultStore } = await import("jotai");
    const store = getDefaultStore();

    // head through the first kvb applied synchronously, pre-listener
    expect(store.get(wsAtoms.socketStateAtom)).toBe(SocketState.Connected);
    expect(store.get(apiAtoms.versionAtom)).toBe("first");
    expect(store.get(wsAtoms.firstFlushAppliedAtom)).toBe(true);
    // the batch behind it stays buffered (deferred past the reveal paint)
    expect(store.get(apiAtoms.clusterAtom)).toBeUndefined();

    // React attaches: the production listener is applyWorkerMessage
    const { applyWorkerMessage } = await import("../applyWsData");
    const { messageEventType } = await import("../ws/ConnectionContext");
    const { renderHook } = await import("@testing-library/react");
    const { useWsWorker } = await import("../worker/useWsWorker");
    const hook = renderHook(() =>
      useWsWorker({
        websocketUrl: consts.websocketUrl,
        compress: consts.websocketCompress,
      }),
    );
    hook.result.current.emitter.addListener(
      messageEventType,
      applyWorkerMessage,
    );

    // post-paint flush: rAF -> timeout(0)
    runRafs();
    vi.advanceTimersByTime(0);
    runRafs();
    vi.advanceTimersByTime(0);
    expect(store.get(apiAtoms.clusterAtom)).toBe("development");

    hook.unmount();
    delete window.__fdWsMain;
  });
});
