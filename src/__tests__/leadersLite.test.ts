import { describe, it, expect } from "vitest";
import { createStore } from "jotai";

import {
  epochAtom,
  leadersLiteAtom,
  myStakeAmountAtom,
  myStakePctAtom,
  peersAtomFamily,
  serverPeerStatsAtom,
  updatePeersAtom,
} from "../atoms";
import { identityKeyAtom } from "../api/atoms";
import { peersSchema } from "../api/entities";
import type { Epoch, Peer, PeersLeaders } from "../api/types";

function makeEpoch(
  epoch: number,
  stakedPubkeys: string[],
  stakedLamports?: bigint[],
): Epoch {
  return {
    epoch,
    start_time_nanos: null,
    end_time_nanos: null,
    start_slot: epoch * 1000,
    end_slot: epoch * 1000 + 999,
    excluded_stake_lamports: 0n,
    staked_pubkeys: stakedPubkeys,
    staked_lamports: stakedLamports ?? stakedPubkeys.map(() => 1n),
    leader_slots: stakedPubkeys.map((_, i) => i),
  };
}

function makeLeaders(
  epoch: number,
  leaders: {
    name?: string | null;
    icon?: string | null;
    delinquent?: boolean | null;
    country?: string | null;
    clientId?: number | null;
  }[],
): PeersLeaders {
  return {
    epoch,
    names: leaders.map((l) => l.name ?? null),
    icon_urls: leaders.map((l) => l.icon ?? null),
    delinquent: leaders.map((l) => l.delinquent ?? null),
    country_codes: leaders.map((l) => l.country ?? null),
    client_ids: leaders.map((l) => l.clientId ?? null),
  };
}

function makeFullPeer(pubkey: string, name: string): Peer {
  return {
    identity_pubkey: pubkey,
    gossip: {
      client_id: 3,
      version: "2.3.6",
      sockets: { gossip: "1.2.3.4:8000" },
      country_code: "DE",
      city_name: "Berlin",
    },
    vote: [
      {
        vote_account: `${pubkey}-vote`,
        activated_stake: 42n,
        delinquent: false,
      },
    ],
    info: {
      name,
      details: null,
      website: null,
      icon_url: `https://icons/${pubkey}.png`,
      keybase_username: null,
    },
  };
}

describe("peers/leaders lite frame", () => {
  it("parses the wire shape", () => {
    const message = {
      topic: "peers",
      key: "leaders",
      value: {
        epoch: 1022,
        names: ["Alice", null],
        icon_urls: ["https://icons/a.png", null],
        delinquent: [false, null],
        country_codes: ["US", null],
        client_ids: [5, null],
      },
    };
    const parsed = peersSchema.safeParse(message);
    expect(parsed.success).toBe(true);
  });

  it("provides a Peer-shaped fallback view from the lite frame", () => {
    const store = createStore();
    store.set(epochAtom, makeEpoch(100, ["pkA", "pkB", "pkC"]));
    store.set(leadersLiteAtom, {
      100: makeLeaders(100, [
        {
          name: "Alice",
          icon: "https://icons/a.png",
          delinquent: false,
          country: "US",
          clientId: 5,
        },
        {},
        { name: "Carol", delinquent: true },
      ]),
    });

    const peerA = store.get(peersAtomFamily("pkA"));
    expect(peerA?.info?.name).toBe("Alice");
    expect(peerA?.info?.icon_url).toBe("https://icons/a.png");
    expect(peerA?.gossip?.country_code).toBe("US");
    expect(peerA?.gossip?.client_id).toBe(5);
    expect(peerA?.gossip?.version).toBeNull();
    // stake joined from the epoch's staked_lamports (index-aligned)
    expect(peerA?.vote).toEqual([
      { vote_account: "", activated_stake: 1n, delinquent: false },
    ]);

    // all-null entry still resolves, with no fabricated info/vote
    const peerB = store.get(peersAtomFamily("pkB"));
    expect(peerB?.identity_pubkey).toBe("pkB");
    expect(peerB?.info).toBeNull();
    expect(peerB?.vote).toEqual([]);

    const peerC = store.get(peersAtomFamily("pkC"));
    expect(peerC?.info?.name).toBe("Carol");
    expect(peerC?.vote[0]?.delinquent).toBe(true);

    // pubkeys outside the epoch's staked set have no view
    expect(store.get(peersAtomFamily("pkX"))).toBeUndefined();
  });

  it("prefers the full peer record over the lite view", () => {
    const store = createStore();
    store.set(epochAtom, makeEpoch(100, ["pkA", "pkB"]));
    store.set(leadersLiteAtom, {
      100: makeLeaders(100, [{ name: "LiteAlice" }, { name: "LiteBob" }]),
    });
    store.set(updatePeersAtom, [makeFullPeer("pkA", "FullAlice")]);

    expect(store.get(peersAtomFamily("pkA"))?.info?.name).toBe("FullAlice");
    expect(store.get(peersAtomFamily("pkA"))?.gossip?.version).toBe("2.3.6");
    // pkB has no full record and stays on the lite view
    expect(store.get(peersAtomFamily("pkB"))?.info?.name).toBe("LiteBob");
  });

  it("header stake falls back to the epoch join and matches the full record", () => {
    const store = createStore();
    store.set(identityKeyAtom, "me");
    store.set(epochAtom, makeEpoch(100, ["me", "other"], [42n, 7n]));
    store.set(leadersLiteAtom, {
      100: makeLeaders(100, [{ delinquent: false }, { delinquent: false }]),
    });
    store.set(serverPeerStatsAtom, {
      rpcCount: 0,
      validatorCount: 2,
      activeStake: 40n,
      delinquentStake: 9n,
    });

    // first-flight: no full peer record yet, stake joined from the epoch
    const fallbackStake = store.get(myStakeAmountAtom);
    expect(fallbackStake).toBe(42n);
    expect(store.get(myStakePctAtom)).toBeCloseTo((42 / 49) * 100);

    // the full record lands: same value by construction, no movement
    store.set(updatePeersAtom, [makeFullPeer("me", "Me")]);
    expect(store.get(myStakeAmountAtom)).toBe(fallbackStake);
  });

  it("aligns each lite frame with the staked_pubkeys of its own epoch", () => {
    const store = createStore();
    store.set(epochAtom, makeEpoch(100, ["pkA", "pkB"]));
    store.set(epochAtom, makeEpoch(101, ["pkB", "pkD"]));
    store.set(leadersLiteAtom, {
      101: makeLeaders(101, [{ name: "Bob@101" }, { name: "Dave@101" }]),
      // a frame for an unknown epoch contributes nothing
      102: makeLeaders(102, [{ name: "Zoe@102" }]),
    });

    // resolved through epoch 101's array positions
    expect(store.get(peersAtomFamily("pkB"))?.info?.name).toBe("Bob@101");
    expect(store.get(peersAtomFamily("pkD"))?.info?.name).toBe("Dave@101");
    // pkA is only staked in epoch 100, which has no lite frame
    expect(store.get(peersAtomFamily("pkA"))).toBeUndefined();

    // once epoch 100's frame lands, the current epoch's mapping wins
    store.set(leadersLiteAtom, {
      100: makeLeaders(100, [{ name: "Alice@100" }, { name: "Bob@100" }]),
      101: makeLeaders(101, [{ name: "Bob@101" }, { name: "Dave@101" }]),
    });
    expect(store.get(peersAtomFamily("pkA"))?.info?.name).toBe("Alice@100");
    expect(store.get(peersAtomFamily("pkB"))?.info?.name).toBe("Bob@100");
  });
});
