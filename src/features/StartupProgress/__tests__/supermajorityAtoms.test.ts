import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { enableMapSet } from "immer";
import { createStore } from "jotai";

import {
  supermajorityCountsAtom,
  updateSupermajorityOnlinePeersAtom,
  deleteSupermajorityDeltaEntriesAtom,
  SUPERMAJORITY_DELTA_WINDOW_MS,
} from "../../../atoms";

enableMapSet();

type Store = ReturnType<typeof createStore>;

function makeStore(initialPeers: string[] = []) {
  const store = createStore();
  store.set(updateSupermajorityOnlinePeersAtom, initialPeers, []);
  return store;
}

function update(store: Store, addPeers: string[], removePeers: string[]) {
  store.set(updateSupermajorityOnlinePeersAtom, addPeers, removePeers);
}

function expire(store: Store, now: number) {
  vi.setSystemTime(now);
  store.set(deleteSupermajorityDeltaEntriesAtom);
}

function counts(store: Store) {
  const { online, offline } = store.get(supermajorityCountsAtom);
  return { online, offline };
}

describe("supermajority counts", () => {
  it("no events returns zeros", () => {
    expect(counts(makeStore())).toEqual({ online: 0, offline: 0 });
  });

  it("counts peers coming online", () => {
    const store = makeStore();

    update(store, ["pkA", "pkB"], []);
    expect(counts(store)).toEqual({ online: 2, offline: 0 });

    update(store, ["pkC"], []);
    expect(counts(store)).toEqual({ online: 3, offline: 0 });
  });

  it("counts peers going offline", () => {
    const store = makeStore(["pkA", "pkB", "pkC"]);

    update(store, [], ["pkA", "pkB"]);
    expect(counts(store)).toEqual({ online: 0, offline: 2 });

    update(store, [], ["pkC"]);
    expect(counts(store)).toEqual({ online: 0, offline: 3 });
  });

  it("counts peers going online and offline", () => {
    const store = makeStore(["pkC", "pkD"]);

    update(store, ["pkA", "pkB"], []);
    expect(counts(store)).toEqual({ online: 2, offline: 0 });

    update(store, [], ["pkC", "pkD"]);
    expect(counts(store)).toEqual({ online: 2, offline: 2 });
  });

  it("peer coming online then offline counts as +0 -0", () => {
    const store = makeStore(["pkB"]);

    update(store, ["pkA"], ["pkB"]);
    expect(counts(store)).toEqual({ online: 1, offline: 1 });

    update(store, ["pkB"], ["pkA"]);
    expect(counts(store)).toEqual({ online: 0, offline: 0 });

    update(store, ["pkA"], ["pkB"]);
    expect(counts(store)).toEqual({ online: 1, offline: 1 });

    update(store, ["pkB"], ["pkA"]);
    expect(counts(store)).toEqual({ online: 0, offline: 0 });
  });

  it("mix of positive, negative, and zero peer events", () => {
    const store = makeStore(["pkD"]);

    update(store, ["pkA", "pkB", "pkC"], ["pkD"]);
    expect(counts(store)).toEqual({ online: 3, offline: 1 });

    update(store, [], ["pkA"]);
    expect(counts(store)).toEqual({ online: 2, offline: 1 });

    update(store, ["pkB"], []);
    expect(counts(store)).toEqual({ online: 2, offline: 1 });
  });

  describe("rolling window expiry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("expire online event", () => {
      vi.setSystemTime(0);
      const store = makeStore();

      update(store, ["pkA"], []);
      expect(counts(store)).toEqual({ online: 1, offline: 0 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 1);
      expect(counts(store)).toEqual({ online: 0, offline: 0 });
    });

    it("expire offline event", () => {
      vi.setSystemTime(0);
      const store = makeStore(["pkA"]);

      update(store, [], ["pkA"]);
      expect(counts(store)).toEqual({ online: 0, offline: 1 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 1);
      expect(counts(store)).toEqual({ online: 0, offline: 0 });
    });

    it("expiring all events returns zeros", () => {
      vi.setSystemTime(0);
      const store = makeStore(["pkB", "pkD"]);

      update(store, ["pkA"], []); // ts=0
      vi.setSystemTime(1);
      update(store, [], ["pkB"]); // ts=1
      vi.setSystemTime(2);
      update(store, ["pkC"], ["pkD"]); // ts=2
      expect(counts(store)).toEqual({ online: 2, offline: 2 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 1); // expires ts=0
      expect(counts(store)).toEqual({ online: 1, offline: 2 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 2); // expires ts=1
      expect(counts(store)).toEqual({ online: 1, offline: 1 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 3); // expires ts=2
      expect(counts(store)).toEqual({ online: 0, offline: 0 });
    });

    it("expiring adjusts rolling window for online/offline counts", () => {
      vi.setSystemTime(0);
      const store = makeStore(["pkA"]);

      update(store, ["pkB"], ["pkA"]); // ts=0
      vi.setSystemTime(1);
      update(store, ["pkA"], ["pkB"]); // ts=1
      expect(counts(store)).toEqual({ online: 0, offline: 0 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 1); // expires ts=0
      expect(counts(store)).toEqual({ online: 1, offline: 1 });
    });

    it("expire event and add a new one", () => {
      vi.setSystemTime(0);
      const store = makeStore(["pkB"]);

      update(store, ["pkA"], []); // ts=0
      vi.setSystemTime(1);
      update(store, [], ["pkB"]); // ts=1
      expect(counts(store)).toEqual({ online: 1, offline: 1 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 1); // expires ts=0
      expect(counts(store)).toEqual({ online: 0, offline: 1 });

      update(store, ["pkC"], []);
      expect(counts(store)).toEqual({ online: 1, offline: 1 });
    });

    it("multiple independent events add and expire correctly", () => {
      vi.setSystemTime(0);
      const store = makeStore(["pkC"]);

      update(store, ["pkA"], []); // ts=0
      vi.setSystemTime(1);
      update(store, ["pkB"], []); // ts=1
      vi.setSystemTime(2);
      update(store, [], ["pkC"]); // ts=2
      expect(counts(store)).toEqual({ online: 2, offline: 1 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 1); // expires ts=0
      expect(counts(store)).toEqual({ online: 1, offline: 1 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 2); // expires ts=1
      expect(counts(store)).toEqual({ online: 0, offline: 1 });

      update(store, ["pkD"], []);
      expect(counts(store)).toEqual({ online: 1, offline: 1 });

      expire(store, SUPERMAJORITY_DELTA_WINDOW_MS + 3); // expires ts=2
      expect(counts(store)).toEqual({ online: 1, offline: 0 });
    });
  });
});
