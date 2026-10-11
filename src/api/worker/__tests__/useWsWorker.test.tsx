import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createStore, getDefaultStore, Provider } from "jotai";
import { enableMapSet } from "immer";
import type { PropsWithChildren } from "react";
import type { Epoch, Peer } from "../../types";
import { useSetAtomWsData } from "../../useSetAtomWsData";
import {
  ConnectionContext,
  messageEventType,
} from "../../ws/ConnectionContext";
import { socketStateAtom } from "../../ws/atoms";
import { SocketState } from "../../ws/types";
import {
  applyPeersBatchAtom,
  currentSlotAtom,
  epochAtom,
  isDocumentVisibleAtom,
  peersAtom,
  peersInitializedAtom,
  peerStatsAtom,
} from "../../../atoms";
import type { FromWorkerMessage, ToWorkerMessage } from "../types";
import { useWsWorker } from "../useWsWorker";

interface MockWorker {
  onmessage: ((event: MessageEvent<FromWorkerMessage>) => unknown) | null;
  postMessage: ReturnType<typeof vi.fn<(message: ToWorkerMessage) => void>>;
  terminate: ReturnType<typeof vi.fn>;
}

const { workers } = vi.hoisted(() => ({ workers: [] as MockWorker[] }));

vi.mock("../wsWorker?worker", () => ({
  default: class implements MockWorker {
    onmessage: MockWorker["onmessage"] = null;
    postMessage = vi.fn<(message: ToWorkerMessage) => void>();
    terminate = vi.fn();

    constructor() {
      workers.push(this);
    }
  },
}));

enableMapSet();

const epoch: Epoch = {
  epoch: 1,
  start_slot: 100,
  end_slot: 199,
  start_time_nanos: null,
  end_time_nanos: null,
  staked_pubkeys: ["a"],
  staked_lamports: [90n],
  excluded_stake_lamports: 10n,
  leader_slots: [],
};
const healthy: Peer = {
  identity_pubkey: "a",
  gossip: null,
  info: null,
  vote: [
    {
      vote_account: "v",
      last_vote: null,
      root_slot: null,
      epoch_credits: 0,
      commission: 5,
      delinquent: false,
    },
  ],
};

function receive(worker: MockWorker, message: FromWorkerMessage) {
  act(() => {
    worker.onmessage?.(new MessageEvent("message", { data: message }));
  });
}

let wasVisible: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  workers.length = 0;
  wasVisible = getDefaultStore().get(isDocumentVisibleAtom);
});

afterEach(() => {
  cleanup();
  getDefaultStore().set(isDocumentVisibleAtom, wasVisible);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("main-thread worker replacement", () => {
  it("still detaches and terminates the worker when a disconnect listener throws", () => {
    const connection = renderHook(useWsWorker, {
      initialProps: { websocketUrl: "ws://localhost", compress: false },
    });
    const emitter = connection.result.current.emitter;
    const error = new Error("listener failed");
    const listener = () => {
      throw error;
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    emitter.addListener(messageEventType, listener);
    try {
      connection.unmount();
      expect(workers[0].onmessage).toBeNull();
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith(
        expect.any(String),
        "Error processing worker message:",
        "disconnected",
        error,
      );
    } finally {
      emitter.removeListener(messageEventType, listener);
      log.mockRestore();
    }
  });

  it.each([true, false])(
    "synchronously resets peers and discards retired delivery while replacement connecting is delayed (visible=%s)",
    (visible) => {
      getDefaultStore().set(isDocumentVisibleAtom, visible);
      const store = createStore();
      store.set(currentSlotAtom, 100);
      store.set(epochAtom, epoch);
      store.set(applyPeersBatchAtom, [healthy], []);
      const connection = renderHook(useWsWorker, {
        initialProps: { websocketUrl: "ws://localhost", compress: false },
      });
      const emitter = connection.result.current.emitter;
      const data = renderHook(useSetAtomWsData, {
        wrapper: ({ children }: PropsWithChildren) => (
          <Provider store={store}>
            <ConnectionContext.Provider value={connection.result.current}>
              {children}
            </ConnectionContext.Provider>
          </Provider>
        ),
      });
      const delivered = vi.fn<(message: FromWorkerMessage) => void>();
      emitter.addListener(messageEventType, delivered);
      const old = workers[0];
      expect(old.postMessage).toHaveBeenCalledExactlyOnceWith({
        type: "connect",
        websocketUrl: "ws://localhost",
        compress: false,
      });
      receive(old, { type: "connected" });
      receive(old, {
        type: "kv",
        topic: "peers",
        key: "update",
        value: { update: [{ ...healthy, vote: [] }] },
      });
      act(() => {
        if (visible) vi.advanceTimersToNextFrame();
        else vi.advanceTimersByTime(0);
      });
      expect(delivered).toHaveBeenCalledTimes(2);
      expect(store.get(socketStateAtom)).toBe(SocketState.Connected);
      expect(store.get(peerStatsAtom)?.nonDelinquentStake).toBe(90n);
      receive(old, {
        type: "kvb",
        items: [
          {
            topic: "peers",
            key: "update",
            value: { add: [{ ...healthy, identity_pubkey: "queued-old" }] },
          },
        ],
      });
      old.terminate.mockImplementation(() => {
        expect(old.onmessage).toBeNull();
        expect(store.get(peersInitializedAtom)).toBe(false);
        expect(store.get(socketStateAtom)).toBe(SocketState.Disconnected);
      });
      connection.rerender({ websocketUrl: "ws://localhost", compress: true });
      expect(connection.result.current.emitter).toBe(emitter);
      expect(old.onmessage).toBeNull();
      expect(old.terminate).toHaveBeenCalledOnce();
      expect(old.postMessage).toHaveBeenLastCalledWith({ type: "disconnect" });
      expect(delivered).toHaveBeenCalledTimes(3);
      expect(delivered).toHaveBeenLastCalledWith({ type: "disconnected" });
      expect(store.get(peersInitializedAtom)).toBe(false);
      expect(store.get(peerStatsAtom)).toBeUndefined();
      const replacement = workers[1];
      expect(replacement.postMessage).toHaveBeenCalledExactlyOnceWith({
        type: "connect",
        websocketUrl: "ws://localhost",
        compress: true,
      });
      act(() => void vi.advanceTimersByTime(2_000));
      expect(delivered).toHaveBeenCalledTimes(3);
      expect(store.get(peersInitializedAtom)).toBe(false);
      expect(store.get(peersAtom)).toEqual({
        a: { ...healthy, removed: false },
      });
      getDefaultStore().set(isDocumentVisibleAtom, true);
      receive(replacement, { type: "connecting" });
      receive(replacement, { type: "connected" });
      receive(replacement, {
        type: "kvb",
        items: [{ topic: "peers", key: "update", value: { add: [] } }],
      });
      act(() => void vi.advanceTimersToNextFrame());
      expect(store.get(peerStatsAtom)).toBeUndefined();
      act(() => void vi.advanceTimersByTime(1_000));
      expect(store.get(peersInitializedAtom)).toBe(true);
      expect(store.get(peersAtom)).toEqual({});
      expect(store.get(peerStatsAtom)?.delinquentStake).toBe(100n);
      emitter.removeListener(messageEventType, delivered);
      data.unmount();
      connection.unmount();
    },
  );
});
