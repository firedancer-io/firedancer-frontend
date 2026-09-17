import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { enableMapSet } from "immer";
import { createStore, getDefaultStore, Provider } from "jotai";
import { createElement, type PropsWithChildren } from "react";
import { identityKeyAtom, voteKeyAtom } from "../api/atoms";
import type { Epoch, Peer } from "../api/types";
import { useSetAtomWsData } from "../api/useSetAtomWsData";
import type { WsEntity } from "../api/worker/types";
import { defaultCtxValue, messageEventType } from "../api/ws/ConnectionContext";
import { socketStateAtom } from "../api/ws/atoms";
import {
  applyPeersBatchAtom,
  currentSlotAtom,
  epochAtom,
  epochStakesAtom,
  gossipPeerCountAtom,
  isDocumentVisibleAtom,
  myStakeAmountAtom,
  myStakePctAtom,
  myVoteAccountAtom,
  peersAtom,
  peersAtomFamily,
  peersCountAtom,
  peersInitializedAtom,
  peerStatsAtom,
  removePeersAtom,
  totalNetworkStakeAtom,
  updatePeersAtom,
} from "../atoms";

enableMapSet();

type Store = ReturnType<typeof createStore>;
type PeerEvent = Extract<WsEntity, { topic: "peers" }>["value"];

const removeDelay = 5 * 60_000;

function makeEpoch(
  entries: [string, bigint][] = [],
  overrides: Partial<Epoch> = {},
): Epoch {
  return {
    epoch: 1,
    start_slot: 100,
    end_slot: 199,
    start_time_nanos: null,
    end_time_nanos: null,
    staked_pubkeys: entries.map(([identity]) => identity),
    staked_lamports: entries.map(([, stake]) => stake),
    excluded_stake_lamports: 0n,
    leader_slots: [],
    ...overrides,
  };
}

function makeVote(
  voteAccount: string,
  delinquent = false,
  commission = 5,
): Peer["vote"][number] {
  return {
    vote_account: voteAccount,
    last_vote: null,
    root_slot: null,
    epoch_credits: 0,
    commission,
    delinquent,
  };
}

function makePeer(identity: string, overrides: Partial<Peer> = {}): Peer {
  return {
    identity_pubkey: identity,
    gossip: {
      wallclock: 0,
      shred_version: 1,
      version: null,
      feature_set: null,
      sockets: {},
    },
    vote: [],
    info: null,
    ...overrides,
  };
}

function makeStore(epoch?: Epoch, initialized = true) {
  const store = createStore();
  store.set(peersInitializedAtom, initialized);
  store.set(currentSlotAtom, 100);
  if (epoch) store.set(epochAtom, epoch);
  return store;
}

function remove(store: Store, ...identities: string[]) {
  store.set(
    removePeersAtom,
    identities.map((identity_pubkey) => ({ identity_pubkey })),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("epoch stake atoms", () => {
  it("keeps stake unknown without an epoch but counts connected gossip peers", () => {
    const store = makeStore();
    store.set(identityKeyAtom, "self");
    store.set(updatePeersAtom, [
      makePeer("self", { vote: [makeVote("self-vote")] }),
      makePeer("rpc"),
      makePeer("vote-only", { gossip: null, vote: [makeVote("vote")] }),
      makePeer("removed"),
    ]);
    remove(store, "removed");

    expect(store.get(epochStakesAtom)).toBeUndefined();
    expect(store.get(totalNetworkStakeAtom)).toBeUndefined();
    expect(store.get(peerStatsAtom)).toBeUndefined();
    expect(store.get(myStakeAmountAtom)).toBeUndefined();
    expect(store.get(myStakePctAtom)).toBeUndefined();
    expect(store.get(gossipPeerCountAtom)).toBe(2);
  });

  it("does not select received epochs until the current slot is known", () => {
    const store = createStore();
    store.set(epochAtom, makeEpoch([["self", 10n]]));
    expect(store.get(epochStakesAtom)).toBeUndefined();
    store.set(currentSlotAtom, 100);
    expect(store.get(totalNetworkStakeAtom)).toBe(10n);
  });

  it("uses the slot-selected epoch, not the latest arrival, and rolls over at its boundary", () => {
    const store = makeStore(
      makeEpoch([["self", 10n]], {
        excluded_stake_lamports: 30n,
      }),
    );
    store.set(identityKeyAtom, "self");
    expect(store.get(totalNetworkStakeAtom)).toBe(40n);
    expect(store.get(myStakePctAtom)).toBe(25);

    store.set(
      epochAtom,
      makeEpoch([["self", 30n]], {
        epoch: 2,
        start_slot: 200,
        end_slot: 299,
        excluded_stake_lamports: 20n,
      }),
    );
    expect(store.get(epochAtom)?.epoch).toBe(1);
    expect(store.get(myStakeAmountAtom)).toBe(10n);
    expect(store.get(totalNetworkStakeAtom)).toBe(40n);

    store.set(currentSlotAtom, 199);
    expect(store.get(totalNetworkStakeAtom)).toBe(40n);
    store.set(currentSlotAtom, 200);
    expect(store.get(epochAtom)?.epoch).toBe(2);
    expect(store.get(myStakeAmountAtom)).toBe(30n);
    expect(store.get(totalNetworkStakeAtom)).toBe(50n);
    expect(store.get(myStakePctAtom)).toBe(60);

    store.set(currentSlotAtom, 300);
    expect(store.get(totalNetworkStakeAtom)).toBeUndefined();
    expect(store.get(peerStatsAtom)).toBeUndefined();
    expect(store.get(myStakeAmountAtom)).toBeUndefined();
  });

  it("does not substitute a future epoch for a missing or invalid current epoch", () => {
    const store = makeStore();
    store.set(updatePeersAtom, [makePeer("self")]);
    store.set(
      epochAtom,
      makeEpoch([["self", 50n]], {
        epoch: 2,
        start_slot: 200,
        end_slot: 299,
      }),
    );
    expect(store.get(totalNetworkStakeAtom)).toBeUndefined();
    expect(store.get(peerStatsAtom)).toBeUndefined();

    store.set(epochAtom, makeEpoch([["self", -1n]]));
    expect(store.get(epochAtom)?.epoch).toBe(1);
    expect(store.get(epochStakesAtom)).toBeUndefined();
    expect(store.get(totalNetworkStakeAtom)).toBeUndefined();
    expect(store.get(peerStatsAtom)).toBeUndefined();
    expect(store.get(gossipPeerCountAtom)).toBe(1);

    store.set(currentSlotAtom, 200);
    expect(store.get(totalNetworkStakeAtom)).toBe(50n);
  });

  it("keeps bigint totals exact and all unobserved stake delinquent", () => {
    const stake = 9_007_199_254_740_993n;
    const store = makeStore(
      makeEpoch(
        [
          ["a", stake],
          ["a", 2n],
          ["b", stake],
        ],
        {
          excluded_stake_lamports: 7n,
        },
      ),
    );
    expect(store.get(peerStatsAtom)).toEqual({
      totalStake: 18_014_398_509_481_995n,
      nonDelinquentStake: 0n,
      delinquentStake: 18_014_398_509_481_995n,
      knownConnectedStake: 0n,
      knownStakedValidatorCount: 2,
      knownStakedPeerCount: 0,
      gossipPeerCount: 0,
    });
  });

  it.each([0n, 10n])(
    "keeps empty epoch coverage valid with %s excluded stake",
    (excludedStake) => {
      const store = makeStore(
        makeEpoch([], { excluded_stake_lamports: excludedStake }),
      );
      expect(store.get(peerStatsAtom)).toEqual({
        totalStake: excludedStake,
        nonDelinquentStake: 0n,
        delinquentStake: excludedStake,
        knownConnectedStake: 0n,
        knownStakedValidatorCount: 0,
        knownStakedPeerCount: 0,
        gossipPeerCount: 0,
      });
    },
  );

  it("classifies full identity stakes independently from gossip, with all remaining epoch stake delinquent", () => {
    const store = makeStore(
      makeEpoch(
        [
          ["mixed", 5n],
          ["delinquent", 10n],
          ["missing", 30n],
          ["removed", 5n],
          ["empty", 7n],
          ["vote-only", 8n],
          ["delinquent-vote-only", 4n],
          ["zero", 0n],
          ["mixed", 15n],
        ],
        { excluded_stake_lamports: 16n },
      ),
    );
    store.set(updatePeersAtom, [
      makePeer("mixed", {
        vote: [makeVote("m1", true), makeVote("m2"), makeVote("m3", true)],
      }),
      makePeer("delinquent", {
        vote: [makeVote("d1", true), makeVote("d2", true)],
      }),
      makePeer("removed", { vote: [makeVote("removed-vote")] }),
      makePeer("empty"),
      makePeer("vote-only", { gossip: null, vote: [makeVote("v")] }),
      makePeer("delinquent-vote-only", {
        gossip: null,
        vote: [makeVote("dv", true)],
      }),
      makePeer("zero", { vote: [makeVote("z")] }),
      makePeer("omitted", { vote: [makeVote("o")] }),
    ]);
    remove(store, "removed");

    const stats = store.get(peerStatsAtom);
    expect(stats).toEqual({
      totalStake: 100n,
      nonDelinquentStake: 28n,
      delinquentStake: 72n,
      knownConnectedStake: 37n,
      knownStakedValidatorCount: 7,
      knownStakedPeerCount: 3,
      gossipPeerCount: 5,
    });
    expect(stats!.nonDelinquentStake + stats!.delinquentStake).toBe(
      stats!.totalStake,
    );
  });

  it("reports 10 delinquent out of the full 100, not out of only connected stake", () => {
    const store = makeStore(
      makeEpoch([
        ["delinquent", 10n],
        ["vote-only", 90n],
      ]),
    );
    store.set(updatePeersAtom, [
      makePeer("delinquent", { vote: [makeVote("d", true)] }),
      makePeer("vote-only", { gossip: null, vote: [makeVote("v")] }),
    ]);

    expect(store.get(peerStatsAtom)).toEqual({
      totalStake: 100n,
      nonDelinquentStake: 90n,
      delinquentStake: 10n,
      knownConnectedStake: 10n,
      knownStakedValidatorCount: 2,
      knownStakedPeerCount: 1,
      gossipPeerCount: 1,
    });
  });

  it("keeps connected stake a lower bound even when all observed peers are healthy", () => {
    const store = makeStore(
      makeEpoch([["mapped", 10n]], { excluded_stake_lamports: 90n }),
    );
    store.set(updatePeersAtom, [
      makePeer("mapped", { vote: [makeVote("mapped-vote")] }),
      makePeer("omitted", { vote: [makeVote("omitted-vote")] }),
    ]);
    expect(store.get(peerStatsAtom)).toMatchObject({
      totalStake: 100n,
      nonDelinquentStake: 10n,
      delinquentStake: 90n,
      knownConnectedStake: 10n,
      knownStakedValidatorCount: 1,
      knownStakedPeerCount: 1,
      gossipPeerCount: 2,
    });
  });
});

describe("self stake and configured vote account", () => {
  it("gets self stake without any peer and preserves it through removal", () => {
    const store = makeStore(
      makeEpoch([["self", 10n]], { excluded_stake_lamports: 90n }),
    );
    store.set(identityKeyAtom, "self");
    expect(store.get(myStakeAmountAtom)).toBe(10n);
    expect(store.get(myStakePctAtom)).toBe(10);

    store.set(updatePeersAtom, [makePeer("self")]);
    remove(store, "self");
    vi.advanceTimersByTime(removeDelay);
    expect(store.get(peersAtom).self).toBeUndefined();
    expect(store.get(myStakeAmountAtom)).toBe(10n);
    expect(store.get(myStakePctAtom)).toBe(10);
  });

  it.each([0n, 90n])(
    "distinguishes missing identity from mapped zero with %s excluded",
    (excludedStake) => {
      const store = makeStore(
        makeEpoch(
          [
            ["other", 10n],
            ["zero", 0n],
          ],
          { excluded_stake_lamports: excludedStake },
        ),
      );
      expect(store.get(myStakeAmountAtom)).toBeUndefined();
      store.set(identityKeyAtom, "missing");
      expect(store.get(myStakeAmountAtom)).toBe(
        excludedStake === 0n ? 0n : undefined,
      );
      expect(store.get(myStakePctAtom)).toBe(
        excludedStake === 0n ? 0 : undefined,
      );
      store.set(identityKeyAtom, "zero");
      expect(store.get(myStakeAmountAtom)).toBe(0n);
      expect(store.get(myStakePctAtom)).toBe(0);
    },
  );

  it("returns an unknown percentage for a zero network total", () => {
    const store = makeStore(makeEpoch([["self", 0n]]));
    store.set(identityKeyAtom, "self");
    expect(store.get(totalNetworkStakeAtom)).toBe(0n);
    expect(store.get(myStakeAmountAtom)).toBe(0n);
    expect(store.get(myStakePctAtom)).toBeUndefined();
  });

  it("matches only the configured vote key on the current identity, without an epoch", () => {
    const store = makeStore();
    const first = makeVote("first", false, 99);
    const configured = makeVote("configured", true, 7);
    const other = makeVote("configured", false, 42);
    store.set(updatePeersAtom, [
      makePeer("self", { gossip: null, vote: [first, configured] }),
      makePeer("other", { vote: [other] }),
    ]);
    expect(store.get(myVoteAccountAtom)).toBeUndefined();
    store.set(voteKeyAtom, "configured");
    expect(store.get(myVoteAccountAtom)).toBeUndefined();
    store.set(identityKeyAtom, "self");
    expect(store.get(myVoteAccountAtom)).toEqual(configured);

    store.set(voteKeyAtom, "missing");
    expect(store.get(myVoteAccountAtom)).toBeUndefined();
    store.set(voteKeyAtom, "first");
    expect(store.get(myVoteAccountAtom)).toEqual(first);
    store.set(voteKeyAtom, undefined);
    expect(store.get(myVoteAccountAtom)).toBeUndefined();
    store.set(voteKeyAtom, "configured");
    store.set(identityKeyAtom, "other");
    expect(store.get(myVoteAccountAtom)).toEqual(other);
    store.set(identityKeyAtom, "absent");
    expect(store.get(myVoteAccountAtom)).toBeUndefined();
    store.set(identityKeyAtom, "self");
    remove(store, "self");
    expect(store.get(myVoteAccountAtom)).toBeUndefined();
  });
});

describe("peer snapshot readiness", () => {
  it("keeps stake classification unavailable without an applied snapshot regardless of elapsed time", () => {
    const store = makeStore(
      makeEpoch([["self", 10n]], { excluded_stake_lamports: 90n }),
      false,
    );
    store.set(identityKeyAtom, "self");
    expect(store.get(peersInitializedAtom)).toBe(false);
    expect(store.get(peerStatsAtom)).toBeUndefined();
    expect(store.get(totalNetworkStakeAtom)).toBe(100n);
    expect(store.get(myStakeAmountAtom)).toBe(10n);
    expect(store.get(myStakePctAtom)).toBe(10);
    store.set(updatePeersAtom, [makePeer("self")]);
    store.set(updatePeersAtom, []);
    vi.advanceTimersByTime(removeDelay);
    expect(store.get(peersInitializedAtom)).toBe(false);
    expect(store.get(peerStatsAtom)).toBeUndefined();
    expect(store.get(gossipPeerCountAtom)).toBe(1);
  });

  it("notifies readiness subscribers only after replacement, upserts, and removals are complete", () => {
    const store = makeStore(
      makeEpoch([
        ["healthy", 90n],
        ["removed", 10n],
      ]),
      false,
    );
    store.set(updatePeersAtom, [makePeer("stale")]);
    const observe = vi.fn(() => {
      expect(Object.keys(store.get(peersAtom))).toEqual(["healthy", "removed"]);
      expect(store.get(peersAtom).removed.removed).toBe(true);
      expect(store.get(peerStatsAtom)).toMatchObject({
        nonDelinquentStake: 90n,
        delinquentStake: 10n,
        knownConnectedStake: 90n,
        knownStakedPeerCount: 1,
        gossipPeerCount: 1,
      });
    });
    const unsubscribe = store.sub(peersInitializedAtom, observe);
    store.set(
      applyPeersBatchAtom,
      [
        makePeer("healthy", { vote: [makeVote("h")] }),
        makePeer("removed", { vote: [makeVote("r")] }),
      ],
      [{ identity_pubkey: "removed" }],
    );
    expect(observe).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("replaces stale metadata and isolates old removal timers from the new stream", () => {
    const store = makeStore(makeEpoch([["a", 10n]]));
    store.set(updatePeersAtom, [makePeer("a"), makePeer("stale")]);
    remove(store, "a", "stale");
    vi.advanceTimersByTime(60_000);
    store.set(peersInitializedAtom, false);
    const fresh = makePeer("a", { vote: [makeVote("fresh")] });
    store.set(applyPeersBatchAtom, [fresh], []);
    expect(store.get(peersAtom).stale).toBeUndefined();
    expect(store.get(peerStatsAtom)?.nonDelinquentStake).toBe(10n);
    vi.advanceTimersByTime(removeDelay - 60_000);
    expect(store.get(peersAtom).a).toEqual({ ...fresh, removed: false });
    remove(store, "a");
    vi.advanceTimersByTime(removeDelay);
    expect(store.get(peersAtom).a).toBeUndefined();
  });

  it("clears removal guards even for identities omitted from the replacement", () => {
    const store = makeStore();
    store.set(updatePeersAtom, [makePeer("a")]);
    remove(store, "a");
    store.set(peersInitializedAtom, false);
    store.set(applyPeersBatchAtom, [], []);
    store.set(peersAtom, { a: makePeer("a", { removed: true }) });
    vi.advanceTimersByTime(removeDelay);
    expect(store.get(peersAtom).a).toBeDefined();
  });

  it("isolates readiness between stores", () => {
    const first = makeStore(makeEpoch([["a", 10n]]), false);
    const second = makeStore(makeEpoch([["a", 10n]]), false);
    first.set(applyPeersBatchAtom, [], []);
    expect(first.get(peerStatsAtom)?.delinquentStake).toBe(10n);
    expect(second.get(peersInitializedAtom)).toBe(false);
    expect(second.get(peerStatsAtom)).toBeUndefined();
  });
});

describe("peer snapshots and removal generations", () => {
  it("replaces shrinking and empty vote arrays and nullable metadata", () => {
    const store = makeStore(makeEpoch([["self", 10n]]));
    const delinquent = makeVote("delinquent", true);
    const healthy = makeVote("healthy");
    store.set(identityKeyAtom, "self");
    store.set(voteKeyAtom, "healthy");
    store.set(updatePeersAtom, [
      makePeer("self", {
        vote: [delinquent, healthy],
        info: {
          name: "old",
          details: null,
          website: null,
          icon_url: null,
          keybase_username: null,
        },
      }),
    ]);
    expect(store.get(peerStatsAtom)?.nonDelinquentStake).toBe(10n);
    expect(store.get(myVoteAccountAtom)).toEqual(healthy);

    store.set(updatePeersAtom, [
      makePeer("self", { gossip: null, vote: [delinquent] }),
    ]);
    expect(store.get(peersAtom).self.vote).toEqual([delinquent]);
    expect(store.get(peersAtom).self.info).toBeNull();
    expect(store.get(peersAtom).self.gossip).toBeNull();
    expect(store.get(myVoteAccountAtom)).toBeUndefined();
    expect(store.get(peerStatsAtom)).toMatchObject({
      nonDelinquentStake: 0n,
      delinquentStake: 10n,
      knownConnectedStake: 0n,
    });

    store.set(updatePeersAtom, [makePeer("self")]);
    expect(store.get(peersAtom).self.vote).toEqual([]);
    expect(store.get(peerStatsAtom)).toMatchObject({
      nonDelinquentStake: 0n,
      delinquentStake: 10n,
      knownConnectedStake: 10n,
    });
  });

  it("retains removed metadata for five minutes, then deletes it", () => {
    const store = makeStore();
    store.set(updatePeersAtom, [makePeer("a", { vote: [makeVote("v")] })]);
    const peerAtom = peersAtomFamily("a");
    remove(store, "a");
    expect(store.get(peerAtom)?.removed).toBe(true);
    expect(store.get(peerAtom)?.vote).toEqual([makeVote("v")]);
    expect(store.get(gossipPeerCountAtom)).toBe(0);
    vi.advanceTimersByTime(removeDelay - 1);
    expect(store.get(peerAtom)).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(store.get(peerAtom)).toBeUndefined();
  });

  it("clears removed on a fresh snapshot and never deletes a readded peer", () => {
    const store = makeStore(makeEpoch([["a", 10n]]));
    store.set(updatePeersAtom, [makePeer("a", { vote: [makeVote("old")] })]);
    remove(store, "a");
    expect(store.get(peerStatsAtom)?.delinquentStake).toBe(10n);
    vi.advanceTimersByTime(60_000);
    const fresh = makePeer("a", { vote: [makeVote("fresh")] });
    store.set(updatePeersAtom, [fresh]);
    expect(store.get(peersAtom).a.removed).toBe(false);
    expect(store.get(peerStatsAtom)?.nonDelinquentStake).toBe(10n);
    vi.advanceTimersByTime(removeDelay);
    expect(store.get(peersAtom).a).toEqual({ ...fresh, removed: false });
  });

  it("does not let an earlier removal delete a later removal generation", () => {
    const store = makeStore();
    store.set(updatePeersAtom, [makePeer("a")]);
    remove(store, "a");
    vi.advanceTimersByTime(60_000);
    store.set(updatePeersAtom, [makePeer("a")]);
    remove(store, "a");
    vi.advanceTimersByTime(removeDelay - 60_000);
    expect(store.get(peersAtom).a?.removed).toBe(true);
    vi.advanceTimersByTime(60_000 - 1);
    expect(store.get(peersAtom).a).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(store.get(peersAtom).a).toBeUndefined();
  });

  it("renews retention for repeated removals even without a readd", () => {
    const store = makeStore();
    store.set(updatePeersAtom, [makePeer("a")]);
    remove(store, "a");
    vi.advanceTimersByTime(60_000);
    remove(store, "a");
    vi.advanceTimersByTime(removeDelay - 60_000);
    expect(store.get(peersAtom).a?.removed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(store.get(peersAtom).a).toBeUndefined();
  });

  it("guards every identity in a removal batch independently", () => {
    const store = makeStore();
    store.set(updatePeersAtom, [makePeer("a"), makePeer("b")]);
    remove(store, "a", "b", "missing");
    vi.advanceTimersByTime(60_000);
    store.set(updatePeersAtom, [makePeer("a"), makePeer("missing")]);
    vi.advanceTimersByTime(removeDelay);
    expect(store.get(peersAtom).a?.removed).toBe(false);
    expect(store.get(peersAtom).b).toBeUndefined();
    expect(store.get(peersAtom).missing?.removed).toBe(false);
  });

  it("isolates removal generations between stores with the same identity", () => {
    const first = makeStore();
    const second = makeStore();
    first.set(updatePeersAtom, [makePeer("a")]);
    second.set(updatePeersAtom, [makePeer("a")]);
    remove(first, "a");
    vi.advanceTimersByTime(60_000);
    remove(second, "a");
    vi.advanceTimersByTime(removeDelay - 60_000);
    expect(first.get(peersAtom).a).toBeUndefined();
    expect(second.get(peersAtom).a?.removed).toBe(true);
    first.set(updatePeersAtom, [makePeer("a")]);
    vi.advanceTimersByTime(60_000);
    expect(first.get(peersAtom).a?.removed).toBe(false);
    expect(second.get(peersAtom).a).toBeUndefined();
  });
});

describe("worker message stake data updates", () => {
  let wasVisible: boolean;

  beforeEach(() => {
    wasVisible = getDefaultStore().get(isDocumentVisibleAtom);
    getDefaultStore().set(isDocumentVisibleAtom, true);
  });

  afterEach(() => {
    getDefaultStore().set(isDocumentVisibleAtom, wasVisible);
  });

  function mount(store: Store) {
    return renderHook(useSetAtomWsData, {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(Provider, { store }, children),
    });
  }

  function send(...items: WsEntity[]) {
    act(() => {
      defaultCtxValue.emitter.emit(messageEventType, { type: "kvb", items });
    });
  }

  function sendPeers(...events: PeerEvent[]) {
    send(
      ...events.map(
        (value): WsEntity => ({ topic: "peers", key: "update", value }),
      ),
    );
  }

  function flush() {
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
  }

  function lifecycle(type: "connecting" | "connected" | "disconnected") {
    act(() => {
      defaultCtxValue.emitter.emit(messageEventType, { type });
    });
  }

  it("does not initialize from an epoch and slot without a peer event", () => {
    const store = makeStore(undefined, false);
    mount(store);
    send({ topic: "epoch", key: "new", value: makeEpoch([["a", 100n]]) });
    act(() => void vi.advanceTimersByTime(60_000));
    expect(store.get(totalNetworkStakeAtom)).toBe(100n);
    expect(store.get(peersInitializedAtom)).toBe(false);
    expect(store.get(peerStatsAtom)).toBeUndefined();
  });

  it.each(["epoch-first", "peers-first", "combined"])(
    "waits for both epoch and applied peers with %s delivery",
    (order) => {
      const store = makeStore(undefined, false);
      mount(store);
      const epoch: WsEntity = {
        topic: "epoch",
        key: "new",
        value: makeEpoch([["a", 90n]], { excluded_stake_lamports: 10n }),
      };
      const peers: WsEntity = {
        topic: "peers",
        key: "update",
        value: { add: [makePeer("a", { vote: [makeVote("v")] })] },
      };
      if (order === "combined") send(epoch, peers);
      else if (order === "epoch-first") {
        send(epoch);
        send(peers);
      } else send(peers);
      expect(store.get(peersInitializedAtom)).toBe(false);
      expect(store.get(peerStatsAtom)).toBeUndefined();
      act(() => void vi.advanceTimersByTime(999));
      expect(store.get(peerStatsAtom)).toBeUndefined();
      act(() => void vi.advanceTimersByTime(1));
      expect(store.get(peersInitializedAtom)).toBe(true);
      if (order === "peers-first") {
        expect(store.get(peerStatsAtom)).toBeUndefined();
        send(epoch);
      }
      expect(store.get(peerStatsAtom)).toMatchObject({
        totalStake: 100n,
        nonDelinquentStake: 90n,
        delinquentStake: 10n,
      });
    },
  );

  it("initializes an empty received event only when it flushes", () => {
    const store = makeStore(makeEpoch([["a", 100n]]), false);
    mount(store);
    sendPeers({ add: [] });
    expect(store.get(peerStatsAtom)).toBeUndefined();
    flush();
    expect(store.get(peersInitializedAtom)).toBe(true);
    expect(store.get(peerStatsAtom)).toMatchObject({
      totalStake: 100n,
      nonDelinquentStake: 0n,
      delinquentStake: 100n,
    });
  });

  it("flushes a continuously updated snapshot at maxWait", () => {
    const store = makeStore(makeEpoch([["a", 100n]]), false);
    mount(store);
    sendPeers({ add: [makePeer("a")] });
    act(() => void vi.advanceTimersByTime(500));
    sendPeers({ update: [makePeer("a", { vote: [makeVote("v")] })] });
    act(() => void vi.advanceTimersByTime(499));
    expect(store.get(peerStatsAtom)).toBeUndefined();
    act(() => void vi.advanceTimersByTime(1));
    expect(store.get(peerStatsAtom)?.nonDelinquentStake).toBe(100n);
  });

  it.each(["connecting", "disconnected"] as const)(
    "resets synchronously before %s and cancels pending peer changes",
    (type) => {
      const store = makeStore(makeEpoch([["a", 100n]]));
      store.set(updatePeersAtom, [makePeer("a", { vote: [makeVote("v")] })]);
      mount(store);
      lifecycle("connected");
      sendPeers({ remove: [{ identity_pubkey: "a" }] });
      const observe = vi.fn(() => {
        expect(store.get(peersInitializedAtom)).toBe(false);
        expect(store.get(peerStatsAtom)).toBeUndefined();
      });
      const unsubscribe = store.sub(socketStateAtom, observe);
      act(() => {
        defaultCtxValue.emitter.emit(messageEventType, { type });
        expect(store.get(peersInitializedAtom)).toBe(false);
        expect(store.get(peerStatsAtom)).toBeUndefined();
        expect(store.get(peersCountAtom)).toBe(1);
      });
      expect(observe).toHaveBeenCalledTimes(1);
      unsubscribe();
      flush();
      expect(store.get(peersAtom).a.removed).toBe(false);
      expect(store.get(peersInitializedAtom)).toBe(false);
      lifecycle("connected");
      sendPeers({ add: [] });
      flush();
      expect(store.get(peersAtom)).toEqual({});
      expect(store.get(peerStatsAtom)?.delinquentStake).toBe(100n);
    },
  );

  it("discards a buffered old healthy snapshot before reconnecting with an empty one", () => {
    const store = makeStore(makeEpoch([["a", 100n]]), false);
    mount(store);
    sendPeers({ add: [makePeer("a", { vote: [makeVote("v")] })] });
    lifecycle("disconnected");
    lifecycle("connecting");
    lifecycle("connected");
    flush();
    expect(store.get(peerStatsAtom)).toBeUndefined();
    sendPeers({ add: [] });
    flush();
    expect(store.get(peerStatsAtom)?.delinquentStake).toBe(100n);
    expect(store.get(peersAtom)).toEqual({});
  });

  it.each(["flush", "connecting", "disconnected", "unmount"] as const)(
    "defers hidden snapshots to RAF and handles %s without stale readiness",
    (action) => {
      getDefaultStore().set(isDocumentVisibleAtom, false);
      const frames = new Map<number, FrameRequestCallback>();
      let nextId = 0;
      const request = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((cb) => {
          frames.set(++nextId, cb);
          return nextId;
        });
      const cancel = vi
        .spyOn(window, "cancelAnimationFrame")
        .mockImplementation((id) => {
          frames.delete(id);
        });
      try {
        const store = makeStore(makeEpoch([["a", 100n]]), false);
        const { unmount } = mount(store);
        sendPeers({ add: [makePeer("a", { vote: [makeVote("v")] })] });
        expect(frames.size).toBe(1);
        act(() => void vi.advanceTimersByTime(60_000));
        expect(store.get(peerStatsAtom)).toBeUndefined();
        if (action === "flush") {
          getDefaultStore().set(isDocumentVisibleAtom, true);
          act(() => {
            const callbacks = [...frames.values()];
            frames.clear();
            for (const cb of callbacks) cb(performance.now());
          });
          expect(store.get(peerStatsAtom)?.nonDelinquentStake).toBe(100n);
        } else {
          if (action === "unmount") unmount();
          else lifecycle(action);
          expect(cancel).toHaveBeenCalled();
          expect(frames.size).toBe(0);
          flush();
          expect(store.get(peersInitializedAtom)).toBe(false);
          expect(store.get(peerStatsAtom)).toBeUndefined();
        }
        unmount();
      } finally {
        request.mockRestore();
        cancel.mockRestore();
      }
    },
  );

  it("cancels a visible pending snapshot on unmount", () => {
    const store = makeStore(makeEpoch([["a", 100n]]), false);
    const { unmount } = mount(store);
    sendPeers({ add: [makePeer("a")] });
    unmount();
    flush();
    expect(store.get(peersInitializedAtom)).toBe(false);
    expect(store.get(peersAtom)).toEqual({});
  });

  it("keeps readiness through same-socket identity rotation and epoch rollover", () => {
    const store = makeStore(makeEpoch([["a", 100n]]), false);
    mount(store);
    sendPeers({ add: [makePeer("a", { vote: [makeVote("v")] })] });
    flush();
    send({ topic: "summary", key: "identity_key", value: "a" });
    send({ topic: "summary", key: "identity_key", value: "b" });
    expect(store.get(peersInitializedAtom)).toBe(true);
    expect(store.get(peerStatsAtom)?.nonDelinquentStake).toBe(100n);
    send({
      topic: "epoch",
      key: "new",
      value: makeEpoch([["a", 90n]], {
        epoch: 2,
        start_slot: 200,
        end_slot: 299,
        excluded_stake_lamports: 10n,
      }),
    });
    act(() => store.set(currentSlotAtom, 200));
    expect(store.get(peersInitializedAtom)).toBe(true);
    expect(store.get(peerStatsAtom)).toMatchObject({
      nonDelinquentStake: 90n,
      delinquentStake: 10n,
    });
  });

  it("stores summary.vote_key and selects its matching vote account", () => {
    const store = makeStore();
    store.set(updatePeersAtom, [
      makePeer("self", {
        vote: [makeVote("first"), makeVote("configured", false, 7)],
      }),
    ]);
    mount(store);
    send(
      { topic: "summary", key: "identity_key", value: "self" },
      { topic: "summary", key: "vote_key", value: "configured" },
    );
    expect(store.get(voteKeyAtom)).toBe("configured");
    expect(store.get(myVoteAccountAtom)?.commission).toBe(7);
  });

  it.each(["add", "update"] as const)(
    "lets a later %s supersede a queued removal",
    (kind) => {
      const store = makeStore();
      store.set(updatePeersAtom, [makePeer("a")]);
      mount(store);
      const fresh = makePeer("a", { vote: [makeVote("fresh")] });
      sendPeers({ remove: [{ identity_pubkey: "a" }] });
      sendPeers({ [kind]: [fresh] });
      expect(store.get(peersAtom).a.vote).toEqual([]);
      flush();
      expect(store.get(peersAtom).a).toEqual({ ...fresh, removed: false });
      act(() => {
        vi.advanceTimersByTime(removeDelay);
      });
      expect(store.get(peersAtom).a?.removed).toBe(false);
    },
  );

  it.each(["add", "update"] as const)(
    "lets a later removal supersede a queued %s",
    (kind) => {
      const store = makeStore();
      store.set(updatePeersAtom, [makePeer("a")]);
      mount(store);
      sendPeers(
        { [kind]: [makePeer("a", { vote: [makeVote("superseded")] })] },
        { remove: [{ identity_pubkey: "a" }] },
      );
      flush();
      expect(store.get(peersAtom).a?.removed).toBe(true);
      expect(store.get(peersAtom).a.vote).toEqual([]);
    },
  );

  it("keeps the latest snapshot for each identity through multiple buffered events", () => {
    const store = makeStore();
    mount(store);
    sendPeers(
      {
        add: [
          makePeer("a", { vote: [makeVote("old"), makeVote("tail")] }),
          makePeer("b"),
        ],
      },
      { remove: [{ identity_pubkey: "a" }, { identity_pubkey: "b" }] },
      { update: [makePeer("a", { vote: [makeVote("fresh")] })] },
      { update: [makePeer("a")] },
    );
    flush();
    expect(store.get(peersAtom).a).toEqual({
      ...makePeer("a"),
      removed: false,
    });
    expect(store.get(peersAtom).b).toBeUndefined();
  });
});
