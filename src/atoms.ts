import { atom } from "jotai";
import { slotsPerLeader } from "./consts";
import { atomWithImmer } from "jotai-immer";
import {
  estimatedSlotDurationAtom,
  identityKeyAtom,
  skippedSlotsAtom,
  startupProgressAtom,
} from "./api/atoms";
import type {
  Epoch,
  Peer,
  PeerRemove,
  SkipRate,
  SlotLevel,
  SlotResponse,
} from "./api/types";
import { clamp, merge } from "lodash";
import { getLeaderSlots, getSlotGroupLeader, getStake } from "./utils";
import { searchLeaderSlotsAtom } from "./features/LeaderSchedule/atoms";
import { selectedSlotAtom } from "./features/Overview/SlotPerformance/atoms";
import { ClientEnum, clientSchema } from "./api/entities";
import { atomFamily } from "jotai/utils";
import memoize from "micro-memoize";

export const clientAtom = atom(() => {
  const parsedClient = clientSchema.safeParse(
    (import.meta.env.VITE_VALIDATOR_CLIENT as string)?.trim(),
  );

  if (parsedClient.error) {
    // default
    return ClientEnum.Firedancer;
  }

  return parsedClient.data;
});

export const containerElAtom = atom<HTMLDivElement | null>();
export const slotsListElAtom = atom<HTMLDivElement | null>();

export const _isNavCollapsedAtom = atom(false);

export const bootProgressContainerElAtom = atom<HTMLDivElement | null>();

const _epochsAtom = atomWithImmer<Epoch[]>([]);
export const epochAtom = atom(
  (get) => {
    const currentSlot = get(currentSlotAtom);
    const epochs = get(_epochsAtom);
    if (!epochs.length || currentSlot === undefined) return;

    const epoch = epochs.find(
      ({ start_slot, end_slot }) =>
        currentSlot >= start_slot && currentSlot <= end_slot,
    );
    if (!epoch) return;

    return epoch;
  },
  (get, set, epoch: Epoch) => {
    set(_epochsAtom, (draft) => {
      draft.push(epoch);
    });
  },
);

export const nextEpochAtom = atom((get) => {
  const currentEpoch = get(epochAtom);
  if (!currentEpoch) return;

  const nextEpoch = get(_epochsAtom).find(
    (epoch) => epoch.epoch === currentEpoch?.epoch + 1,
  );

  return nextEpoch;
});

export const [slotOverrideAtom, autoScrollAtom] =
  (function getSlotOverrideAtom() {
    const _slotOverrideAtom = atom<number>();

    return [
      atom(
        (get) => get(_slotOverrideAtom),
        (get, set, slot: number | undefined) => {
          const epoch = get(epochAtom);
          if (!epoch) return;

          const clampedSlot =
            slot === undefined
              ? undefined
              : clamp(
                  getSlotGroupLeader(slot),
                  epoch.start_slot,
                  epoch.end_slot,
                );

          set(_slotOverrideAtom, clampedSlot);
        },
      ),
      atom((get) => get(_slotOverrideAtom) === undefined),
    ];
  })();

const slotStatusAtom = atomWithImmer<Record<number, SlotLevel>>({});

export const getSlotStatus = memoize(
  (slot?: number) =>
    atom((get) =>
      slot !== undefined
        ? get(slotStatusAtom)[slot] || "incomplete"
        : "incomplete",
    ),
  { maxSize: 1_000 },
);

export enum SlotNavFilter {
  AllSlots = "All Slots",
  MySlots = "My Slots",
}
export const slotNavFilterAtom = (function getSlotNavFilterAtom() {
  const _slotNavFilterAtom = atom<SlotNavFilter>();
  return atom(
    (get) => get(_slotNavFilterAtom) ?? SlotNavFilter.AllSlots,
    (get, set, filter: SlotNavFilter | undefined) => {
      set(_slotNavFilterAtom, filter);

      // Reset scroll to selected slot or RT
      const selectedSlot = get(selectedSlotAtom);
      set(slotOverrideAtom, selectedSlot ?? undefined);
    },
  );
})();

export const setSlotStatusAtom = atom(
  null,
  (_, set, slot: number, level: SlotLevel) => {
    if (
      level === "completed" ||
      level === "optimistically_confirmed" ||
      level === "rooted"
    ) {
      set(currentSlotAtom, slot + 1);
    }
    set(slotStatusAtom, (draft) => {
      draft[slot] = level;
    });
  },
);

const selectedSlotNearbyOffset = 2;
const selectedSlotNearbyYouLeadersAtom = atom<number[] | undefined>((get) => {
  const leaderSlots = get(leaderSlotsAtom);
  const selectedSlot = get(selectedSlotAtom);
  if (leaderSlots === undefined || selectedSlot === undefined) return undefined;
  const index = leaderSlots.indexOf(getSlotGroupLeader(selectedSlot));
  if (index === -1) return undefined;
  return leaderSlots.slice(
    Math.max(index - selectedSlotNearbyOffset, 0),
    index + selectedSlotNearbyOffset,
  );
});

const slotCacheBounds = 1_000;

export const deleteSlotStatusBoundsAtom = atom(null, (get, set) => {
  const slotOverride = get(slotOverrideAtom);
  const selectedSlotNearbyLeaders = get(selectedSlotNearbyYouLeadersAtom);
  const currentSlot = get(currentSlotAtom);
  const searchSlots = get(searchLeaderSlotsAtom);
  const leaderSlots = get(leaderSlotsAtom);
  const navFilter = get(slotNavFilterAtom);
  const slot = slotOverride ?? currentSlot;

  if (slot !== undefined) {
    set(slotStatusAtom, (draft) => {
      const cacheSlotMin = slot - slotCacheBounds / 2;
      const cacheSlotMax = slot + slotCacheBounds / 2;
      const cachedStatusSlots = Object.keys(draft);
      for (const cachedStatusSlot of cachedStatusSlots) {
        const numberVal = Number(cachedStatusSlot);
        const slotGroupStart = getSlotGroupLeader(numberVal);

        if (searchSlots?.includes(slotGroupStart)) {
          continue;
        }

        if (selectedSlotNearbyLeaders?.includes(slotGroupStart)) {
          continue;
        }

        if (
          navFilter === SlotNavFilter.MySlots &&
          leaderSlots?.includes(slotGroupStart)
        ) {
          continue;
        }

        if (
          !isNaN(numberVal) &&
          (numberVal < cacheSlotMin || numberVal > cacheSlotMax)
        ) {
          delete draft[numberVal];
        }
      }
    });
  }
});

const slotResponseAtom = atomWithImmer<Record<number, SlotResponse>>({});

export const slotPublishAtomFamily = atomFamily((slot?: number) =>
  atom((get) =>
    slot !== undefined ? get(slotResponseAtom)[slot]?.publish : undefined,
  ),
);

export const slotResponseAtomFamily = atomFamily((slot?: number) =>
  atom((get) => (slot !== undefined ? get(slotResponseAtom)[slot] : undefined)),
);

export const setSlotResponseAtom = atom(
  null,
  (_, set, response: SlotResponse) => {
    const slot = response.publish.slot;
    set(slotResponseAtom, (draft) => {
      response.transactions ??= draft[slot]?.transactions;
      response.tile_primary_metric ??= draft[slot]?.tile_primary_metric;
      response.tile_timers ??= draft[slot]?.tile_timers;
      response.waterfall ??= draft[slot]?.waterfall;

      draft[slot] = response;
    });
  },
);

export const deleteSlotResponseBoundsAtom = atom(null, (get, set) => {
  const slotOverride = get(slotOverrideAtom);
  const selectedSlot = get(selectedSlotAtom);

  const currentSlot = get(currentSlotAtom);
  const searchSlots = get(searchLeaderSlotsAtom);
  const slot = slotOverride ?? currentSlot;
  const navFilter = get(slotNavFilterAtom);
  const leaderSlots = get(leaderSlotsAtom);

  if (slot !== undefined) {
    set(slotResponseAtom, (draft) => {
      const cacheSlotMin = slot - slotCacheBounds / 2;
      const cacheSlotMax = slot + slotCacheBounds / 2;
      const cachedSlots = Object.keys(draft);
      for (const cachedSlot of cachedSlots) {
        const slotNumber = Number(cachedSlot);
        const slotGroupStart = getSlotGroupLeader(slotNumber);
        if (searchSlots?.length && searchSlots.includes(slotGroupStart)) {
          continue;
        }

        if (
          selectedSlot !== undefined &&
          slotGroupStart === getSlotGroupLeader(selectedSlot)
        ) {
          continue;
        }

        if (
          navFilter === SlotNavFilter.MySlots &&
          leaderSlots?.includes(slotGroupStart)
        ) {
          continue;
        }

        if (
          !isNaN(slotNumber) &&
          (slotNumber < cacheSlotMin || slotNumber > cacheSlotMax)
        ) {
          delete draft[slotNumber];
          slotPublishAtomFamily.remove(slotNumber);
        }
      }
    });
  }
});

export const firstProcessedSlotAtom = atom((get) => {
  const startupProgress = get(startupProgressAtom);
  if (startupProgress?.ledger_max_slot == null) return;

  return startupProgress.ledger_max_slot + 1;
});

export const earliestProcessedSlotLeaderAtom = atom((get) => {
  const firstProcessedSlot = get(firstProcessedSlotAtom);
  const leaderSlots = get(leaderSlotsAtom);

  if (firstProcessedSlot === undefined || !leaderSlots?.length) return;
  return leaderSlots.find((s) => s >= firstProcessedSlot);
});

export const mostRecentSlotLeaderAtom = atom((get) => {
  const earliestProcessedSlotLeader = get(earliestProcessedSlotLeaderAtom);
  const leaderSlots = get(leaderSlotsAtom);
  const currentLeaderSlot = get(currentLeaderSlotAtom);

  if (
    earliestProcessedSlotLeader === undefined ||
    currentLeaderSlot === undefined ||
    !leaderSlots?.length
  )
    return;
  return leaderSlots.findLast(
    (s) => earliestProcessedSlotLeader <= s && s <= currentLeaderSlot,
  );
});

const _currentSlotAtom = atom<number | undefined>(undefined);
export const currentSlotAtom = atom(
  (get) => get(_currentSlotAtom),
  (get, set, slot: number) => {
    const nextLeaderSlot = get(nextLeaderSlotAtom);
    if (nextLeaderSlot === undefined || slot >= nextLeaderSlot) {
      set(nextLeaderSlotAtom, slot);
    }

    set(_currentSlotAtom, (prev) => Math.max(slot, prev ?? 0));
  },
);

/** In order array of your leader slots (only first slot in group of 4) */
export const leaderSlotsAtom = atom((get) => {
  const epoch = get(epochAtom);
  const pubkey = get(identityKeyAtom);

  if (!epoch || !pubkey) return;

  return getLeaderSlots(epoch, pubkey);
});

/** In order array of your leader slots (only first slot in group of 4) */
export const nextEpochLeaderSlotsAtom = atom((get) => {
  const epoch = get(nextEpochAtom);
  const pubkey = get(identityKeyAtom);

  if (!epoch || !pubkey) return;

  return getLeaderSlots(epoch, pubkey);
});

export const nextLeaderSlotIndexAtom = atom<number | undefined>(undefined);
/** Next slot you are leader. Once a leader slot is reached, the next starting leader group of 4 is calculated before your current group of 4 finishes */
export const nextLeaderSlotAtom = atom(
  (get) => {
    const leaderSlots = get(leaderSlotsAtom);
    const nextLeaderIndex = get(nextLeaderSlotIndexAtom);
    if (!leaderSlots || nextLeaderIndex === undefined) return;

    return leaderSlots[nextLeaderIndex];
  },
  (get, set, currentSlot: number) => {
    const leaderSlots = get(leaderSlotsAtom);
    if (leaderSlots == null) return;
    set(nextLeaderSlotIndexAtom, (prevIndex) => {
      let i = prevIndex ?? 0;
      if ((leaderSlots[i - 1] ?? 0) > currentSlot) i = 0;
      while (i < leaderSlots.length && leaderSlots[i] <= currentSlot) {
        i++;
      }
      if (i >= leaderSlots.length) return undefined;
      return i;
    });
  },
);

export const nextEpochLeaderSlotAtom = atom((get) => {
  const leaderSlots = get(nextEpochLeaderSlotsAtom);
  if (!leaderSlots) return;

  return leaderSlots[0];
});

/** Previous slot you were leader */
export const prevLeaderSlotAtom = atom((get) => {
  const leaderSlots = get(leaderSlotsAtom);
  const nextLeaderIndex = get(nextLeaderSlotIndexAtom);
  if (!leaderSlots) return;

  if (nextLeaderIndex === undefined) {
    return leaderSlots[leaderSlots.length - 1];
  }

  return leaderSlots[nextLeaderIndex - 1];
});

export const isCurrentlyLeaderAtom = atom((get) => {
  const slot = get(currentSlotAtom);
  const prevLeaderSlot = get(prevLeaderSlotAtom);

  if (slot === undefined || prevLeaderSlot === undefined) return false;
  if (slot >= prevLeaderSlot && slot <= prevLeaderSlot + slotsPerLeader) {
    return true;
  }
  return false;
});

/** The first slot of the group of slots for current leader */
export const currentLeaderSlotAtom = atom((get) => {
  const currentSlot = get(currentSlotAtom);
  if (currentSlot == null) return;

  return getSlotGroupLeader(currentSlot);
});

export const peersAtom = atomWithImmer<Record<string, Peer>>({});

export const peersListAtom = atom((get) => Object.values(get(peersAtom)));

export const peersAtomFamily = atomFamily((peer?: string) =>
  atom((get) => (peer !== undefined ? get(peersAtom)[peer] : undefined)),
);

export const addPeersAtom = atom(null, (_, set, peers?: Peer[]) => {
  if (!peers?.length) return;

  set(peersAtom, (draft) => {
    for (const peer of peers) {
      draft[peer.identity_pubkey] = peer;
    }
  });
});

export const updatePeersAtom = atom(null, (_, set, peers?: Peer[]) => {
  if (!peers?.length) return;

  set(peersAtom, (draft) => {
    for (const peer of peers) {
      draft[peer.identity_pubkey] = merge(draft[peer.identity_pubkey], peer);
    }
  });
});

const removePeerDelay = 60_000 * 5;
export const removePeersAtom = atom(null, (_, set, peers?: PeerRemove[]) => {
  if (!peers?.length) return;

  set(peersAtom, (draft) => {
    for (const peer of peers) {
      if (draft[peer.identity_pubkey]) {
        draft[peer.identity_pubkey].removed = true;
        peersAtomFamily.remove(peer.identity_pubkey);
      }
    }
  });

  setTimeout(() => {
    set(peersAtom, (draft) => {
      for (const peer of peers) {
        if (draft[peer.identity_pubkey]) {
          delete draft[peer.identity_pubkey];
        }
      }
    });
  }, removePeerDelay);
});

export const peerStatsAtom = atom((get) => {
  const peers = get(peersAtom);
  if (!peers) return;

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
});

export const myStakeAmountAtom = atom((get) => {
  const peers = get(peersAtom);
  const idKey = get(identityKeyAtom);
  const peerStats = get(peerStatsAtom);

  if (!peers || !idKey || !peerStats) return;

  const myPeer = peers[idKey];
  if (!myPeer) return;

  return getStake(myPeer);
});

export const myStakePctAtom = atom((get) => {
  const peerStats = get(peerStatsAtom);
  const stake = get(myStakeAmountAtom);

  if (stake === undefined || !peerStats) return;
  if (!(peerStats.activeStake + peerStats.delinquentStake)) return;

  return (
    (Number(stake) /
      Number(peerStats.activeStake + peerStats.delinquentStake)) *
    100
  );
});

export const allLeaderNamesAtom = atom((get) => {
  const epoch = get(epochAtom);
  const peers = get(peersAtom);

  if (!epoch || !peers) return;

  const uniquePubkeys = new Set(
    epoch.leader_slots.map((i) => epoch.staked_pubkeys[i]),
  );
  const leadersWithNames = [...uniquePubkeys].map((pubkey) => ({
    pubkey: pubkey,
    name: peers[pubkey]?.info?.name?.toLowerCase(),
  }));

  return leadersWithNames;
});

export const getSlotStateAtom = (slot?: number) =>
  atom((get) => {
    const currentSlot = get(currentSlotAtom);

    if (currentSlot === undefined || slot === undefined) return "unknown";

    if (slot === currentSlot) return "current";

    if (slot > currentSlot) return "future";

    return "past";
  });

export const getIsCurrentLeaderAtom = (slot?: number) =>
  atom((get) => {
    if (slot === undefined) return false;
    const currentLeaderSlot = get(currentLeaderSlotAtom);
    if (currentLeaderSlot === undefined) return false;

    return (
      currentLeaderSlot <= slot && slot < currentLeaderSlot + slotsPerLeader
    );
  });

export const getIsFutureLeaderAtom = (slot?: number) =>
  atom((get) => {
    if (slot === undefined) return false;
    const currentLeaderSlot = get(currentLeaderSlotAtom);
    if (currentLeaderSlot === undefined) return false;

    return currentLeaderSlot + slotsPerLeader <= slot;
  });

export const getIsPastLeaderAtom = (slot?: number) =>
  atom((get) => {
    if (slot === undefined) return false;
    const currentLeaderSlot = get(currentLeaderSlotAtom);
    if (currentLeaderSlot === undefined) return false;

    return slot < currentLeaderSlot;
  });

export const getIsFutureSlotAtom = memoize(
  (slot?: number) =>
    atom((get) => {
      if (slot === undefined) return true;

      const currentSlot = get(currentSlotAtom);
      if (currentSlot === undefined) return true;

      if (slot >= currentSlot) return true;

      return false;
    }),
  { maxSize: 1_000 },
);

export const getIsSkippedAtom = (slot?: number) =>
  atom((get) => {
    if (slot === undefined) return false;

    const skippedSlots = get(skippedSlotsAtom);
    if (!skippedSlots?.length) return false;

    return skippedSlots.includes(slot);
  });

export const slotDurationAtom = atom((get) => {
  const durationNanos = get(estimatedSlotDurationAtom);
  if (!durationNanos) return 450;

  const durationMs = Math.trunc(durationNanos / 1_000_000);

  return Math.max(50, Math.min(durationMs, 1_000 * 10));
});

/** epoch -> skip rate */
const _skipRateAtom = atomWithImmer<Record<number, SkipRate>>({});

export const skipRateAtom = atom(
  (get) => {
    const epoch = get(epochAtom);
    if (!epoch) return;

    return get(_skipRateAtom)[epoch.epoch];
  },
  (_, set, skipRate: SkipRate) => {
    set(_skipRateAtom, (draft) => {
      draft[skipRate.epoch] = skipRate;
    });
  },
);

export type Status = "Live" | "Past" | "Current" | "Future";
export const statusAtom = atom<Status | null>((get) => {
  const currentSlot = get(currentSlotAtom);
  if (currentSlot === undefined) return null;

  const slotOverride = get(slotOverrideAtom);
  if (slotOverride === undefined) return "Live";

  if (getSlotGroupLeader(slotOverride) === getSlotGroupLeader(currentSlot))
    return "Current";

  if (slotOverride > currentSlot) return "Future";

  return "Past";
});
