import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createStore } from "jotai";
import { produce } from "immer";
import merge from "lodash/merge";

import {
  peersAtom,
  peerStatsAtom,
  serverPeerStatsAtom,
  updatePeersAtom,
  removePeersAtom,
} from "../atoms";
import type { Peer } from "../api/types";

type Store = ReturnType<typeof createStore>;
type PeerMap = Record<string, Peer>;

// Reference implementations preserving the pre-optimization code paths

function refUpdatePeers(state: PeerMap, peers: Peer[]): PeerMap {
  return produce(state, (draft) => {
    for (const peer of peers) {
      if (draft[peer.identity_pubkey]) {
        draft[peer.identity_pubkey] = merge(draft[peer.identity_pubkey], peer);
      } else {
        draft[peer.identity_pubkey] = peer;
      }
    }
  });
}

function refPeerStats(peers: PeerMap) {
  const activePeers = Object.values(peers).filter((p) => !p.removed);
  const rpc = activePeers.filter(
    (p) => p.vote.every((v) => !v.activated_stake) && !!p.gossip,
  );
  const validators = activePeers.filter((p) =>
    p.vote.some((v) => v.activated_stake),
  );
  const activeStake = activePeers.reduce(
    (stake, p) =>
      p.vote.reduce(
        (acc, v) => (v.delinquent ? acc : acc + v.activated_stake),
        0n,
      ) + stake,
    0n,
  );
  const delinquentStake = activePeers.reduce(
    (stake, p) =>
      p.vote.reduce(
        (acc, v) => (v.delinquent ? acc + v.activated_stake : acc),
        0n,
      ) + stake,
    0n,
  );

  return {
    rpcCount: rpc.length,
    validatorCount: validators.length,
    activeStake,
    delinquentStake,
  };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePeer(i: number, rand: () => number): Peer {
  const gossip =
    rand() < 0.1
      ? null
      : {
          client_id: rand() < 0.5 ? Math.floor(rand() * 10) : null,
          wallclock: Math.floor(rand() * 1e9),
          shred_version: 50093,
          version: rand() < 0.9 ? "0.505.20216" : null,
          feature_set: rand() < 0.9 ? Math.floor(rand() * 1e9) : null,
          sockets: {
            gossip: `10.0.${i % 256}.${(i * 7) % 256}:8001`,
            ...(rand() < 0.7 ? { tvu: `10.0.${i % 256}.1:8002` } : {}),
          },
          country_code: rand() < 0.8 ? "US" : null,
          city_name: rand() < 0.8 ? "Chicago" : null,
        };
  const voteCount = rand() < 0.3 ? 0 : rand() < 0.9 ? 1 : 2;
  const vote = Array.from({ length: voteCount }, (_, v) => ({
    vote_account: `vote-${i}-${v}`,
    activated_stake:
      rand() < 0.2 ? 0n : BigInt(Math.floor(rand() * 1e13)) * 1000n,
    delinquent: rand() < 0.1,
  }));
  const info =
    rand() < 0.5
      ? null
      : {
          name: `peer ${i}`,
          details: rand() < 0.5 ? `details ${i}` : null,
          website: null,
          icon_url: null,
          keybase_username: null,
        };

  return { identity_pubkey: `peer-${i}`, gossip, vote, info };
}

function makePeers(count: number, seed: number): Peer[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => makePeer(i, rand));
}

/** Stats must always equal the reference reduction over the live map */
function expectStatsInvariant(store: Store) {
  expect(store.get(peerStatsAtom)).toEqual(refPeerStats(store.get(peersAtom)));
}

describe("peers atoms", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("initial 1000-peer ingest matches the old merge path and old stats", () => {
    const store = createStore();
    const peers = makePeers(1000, 1);

    store.set(updatePeersAtom, peers);

    expect(store.get(peersAtom)).toEqual(refUpdatePeers({}, peers));
    expectStatsInvariant(store);
    expect(store.get(peerStatsAtom)).toEqual(
      refPeerStats(store.get(peersAtom)),
    );
  });

  it("full-snapshot updates match the old merge path", () => {
    const store = createStore();
    const initial = makePeers(1000, 2);
    store.set(updatePeersAtom, initial);
    let ref = refUpdatePeers({}, initial);

    // Full snapshots that don't shrink arrays or drop record keys, where
    // merge and replace agree: value changes, gossip/info null flips
    const rand = mulberry32(3);
    const updates = initial.slice(200, 500).map((p) => ({
      ...p,
      gossip:
        p.gossip === null
          ? makePeer(999999, rand).gossip
          : rand() < 0.1
            ? null
            : { ...p.gossip, wallclock: (p.gossip.wallclock ?? 0) + 1 },
      vote: p.vote.map((v) => ({
        ...v,
        activated_stake: v.activated_stake + 17n,
        delinquent: rand() < 0.2 ? !v.delinquent : v.delinquent,
      })),
      info: rand() < 0.3 ? null : p.info,
    }));

    store.set(updatePeersAtom, updates);
    ref = refUpdatePeers(ref, updates);

    expect(store.get(peersAtom)).toEqual(ref);
    expectStatsInvariant(store);
  });

  it("update replaces shrunken vote arrays and dropped socket keys", () => {
    // Divergence from the old merge path by design: backend updates are
    // full snapshots, so stale entries must not be retained
    const store = createStore();
    const base: Peer = {
      identity_pubkey: "pk",
      gossip: {
        client_id: 1,
        wallclock: 1,
        shred_version: 1,
        version: "1",
        feature_set: 1,
        sockets: { gossip: "1.1.1.1:8001", tvu: "1.1.1.1:8002" },
        country_code: null,
        city_name: null,
      },
      vote: [
        { vote_account: "a", activated_stake: 5n, delinquent: false },
        { vote_account: "b", activated_stake: 7n, delinquent: true },
      ],
      info: null,
    };
    store.set(updatePeersAtom, [base]);

    const snapshot: Peer = {
      identity_pubkey: "pk",
      gossip: { ...base.gossip!, sockets: { gossip: "1.1.1.1:8001" } },
      vote: [{ vote_account: "a", activated_stake: 6n, delinquent: false }],
      info: null,
    };
    store.set(updatePeersAtom, [snapshot]);

    expect(store.get(peersAtom)["pk"]).toEqual(snapshot);
    expectStatsInvariant(store);
  });

  it("keeps the removed flag on update and re-add, like the old merge path", () => {
    const store = createStore();
    const [peer] = makePeers(1, 4);
    store.set(updatePeersAtom, [peer]);
    store.set(removePeersAtom, [{ identity_pubkey: peer.identity_pubkey }]);

    expect(store.get(peersAtom)[peer.identity_pubkey].removed).toBe(true);
    expectStatsInvariant(store);

    // merge kept removed: true because incoming peers lack the field
    store.set(updatePeersAtom, [peer]);
    expect(store.get(peersAtom)[peer.identity_pubkey].removed).toBe(true);
    expectStatsInvariant(store);
  });

  it("remove subtracts stats once, ignores unknown peers, deletes after delay", () => {
    const store = createStore();
    const peers = makePeers(10, 5);
    store.set(updatePeersAtom, peers);

    store.set(removePeersAtom, [
      { identity_pubkey: "peer-0" },
      { identity_pubkey: "does-not-exist" },
    ]);
    expectStatsInvariant(store);

    store.set(removePeersAtom, [{ identity_pubkey: "peer-0" }]);
    expectStatsInvariant(store);

    vi.advanceTimersByTime(60_000 * 5);
    expect(store.get(peersAtom)["peer-0"]).toBeUndefined();
    expect(store.get(peersAtom)["peer-1"]).toBeDefined();
    expectStatsInvariant(store);
  });

  it("last entry wins for duplicate pubkeys in one batch", () => {
    const store = createStore();
    const [a] = makePeers(1, 6);
    const b: Peer = { ...a, vote: [] };

    store.set(updatePeersAtom, [a, b]);
    expect(store.get(peersAtom)[a.identity_pubkey]).toEqual(b);
    expectStatsInvariant(store);
  });

  it("serves the local aggregate until a pushed stats frame arrives", () => {
    const store = createStore();
    store.set(updatePeersAtom, makePeers(50, 8));
    expectStatsInvariant(store);

    const pushed = {
      rpcCount: 4310,
      validatorCount: 1477,
      activeStake: 399941148700762892n,
      delinquentStake: 725162624735358n,
    };
    store.set(serverPeerStatsAtom, pushed);
    expect(store.get(peerStatsAtom)).toEqual(pushed);
  });

  it("pushed stats win over local increments; a newer push overwrites", () => {
    const store = createStore();
    const pushed = {
      rpcCount: 1,
      validatorCount: 2,
      activeStake: 3n,
      delinquentStake: 4n,
    };
    store.set(serverPeerStatsAtom, pushed);
    expect(store.get(peerStatsAtom)).toEqual(pushed);

    store.set(updatePeersAtom, makePeers(100, 9));
    expect(store.get(peerStatsAtom)).toEqual(pushed);
    store.set(removePeersAtom, [{ identity_pubkey: "peer-1" }]);
    vi.advanceTimersByTime(60_000 * 5);
    expect(store.get(peerStatsAtom)).toEqual(pushed);

    const newer = { ...pushed, validatorCount: 5, activeStake: 6n };
    store.set(serverPeerStatsAtom, newer);
    expect(store.get(peerStatsAtom)).toEqual(newer);

    // once a push seeds, the local aggregate is no longer maintained
    // (the derived atom never reads it again); clearing the push exposes
    // the frozen pre-seed aggregate (accepted: no backend stops pushing)
    store.set(serverPeerStatsAtom, undefined);
    expect(store.get(peerStatsAtom)).toEqual({
      rpcCount: 0,
      validatorCount: 0,
      activeStake: 0n,
      delinquentStake: 0n,
    });
  });

  it("stats stay consistent through a randomized add/update/remove sequence", () => {
    const store = createStore();
    const rand = mulberry32(7);

    for (let step = 0; step < 40; step++) {
      const op = rand();
      if (op < 0.5) {
        const start = Math.floor(rand() * 150);
        const count = 1 + Math.floor(rand() * 50);
        const seed = Math.floor(rand() * 1000);
        const r = mulberry32(seed);
        store.set(
          updatePeersAtom,
          Array.from({ length: count }, (_, i) => makePeer(start + i, r)),
        );
      } else if (op < 0.8) {
        const count = 1 + Math.floor(rand() * 20);
        store.set(
          removePeersAtom,
          Array.from({ length: count }, () => ({
            identity_pubkey: `peer-${Math.floor(rand() * 150)}`,
          })),
        );
      } else {
        vi.advanceTimersByTime(Math.floor(rand() * 60_000 * 6));
      }
      expectStatsInvariant(store);
    }
  });
});
