import { atom } from "jotai";
import { nsPerMs, slotsPerLeader } from "./consts";
import { atomWithImmer } from "jotai-immer";
import {
  bootProgressAtom,
  estimatedSlotDurationAtom,
  identityKeyAtom,
  serverTimeNanosAtom,
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
import {
  getDiscountedVoteLatency,
  getLeaderSlots,
  getSlotGroupLeader,
  getStake,
} from "./utils";
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
    return ClientEnum.Frankendancer;
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
  (_get, set, epoch: Epoch) => {
    set(_epochsAtom, (draft) => {
      const isDuplicate =
        draft.findIndex((e) => e.epoch === epoch.epoch) !== -1;
      if (isDuplicate) return;

      draft.push(epoch);
    });
  },
);

export const deletePreviousEpochsAtom = atom(
  null,
  (_get, set, currentEpoch: number) => {
    set(_epochsAtom, (draft) => {
      draft = draft?.filter(({ epoch }) => epoch >= currentEpoch);
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

const selectedSlotNearbyOffset = 10;
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
      response.scheduler_counts ??= draft[slot]?.scheduler_counts;
      response.limits ??= draft[slot]?.limits;
      response.scheduler_stats ??= draft[slot]?.scheduler_stats;

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
  const client = get(clientAtom);
  if (client === ClientEnum.Frankendancer) {
    const startupProgress = get(startupProgressAtom);
    if (startupProgress?.ledger_max_slot == null) return;

    return startupProgress.ledger_max_slot + 1;
  }

  return get(bootProgressAtom)?.catching_up_first_replay_slot ?? undefined;
});

export const firstProcessedLeaderIndexAtom = atom((get) => {
  const leaderSlots = get(leaderSlotsAtom);
  const firstProcessedSlot = get(firstProcessedSlotAtom);

  if (!leaderSlots || firstProcessedSlot === undefined) return;

  const leaderIndex = leaderSlots.findIndex((s) => s >= firstProcessedSlot);
  return leaderIndex !== -1 ? leaderIndex : undefined;
});

export const firstProcessedLeaderAtom = atom((get) => {
  const leaderSlots = get(leaderSlotsAtom);
  const firstProcessedLeaderIndex = get(firstProcessedLeaderIndexAtom);
  return firstProcessedLeaderIndex
    ? leaderSlots?.[firstProcessedLeaderIndex]
    : undefined;
});

export const lastProcessedLeaderAtom = atom((get) => {
  const leaderSlots = get(leaderSlotsAtom);
  const nextLeaderSlotIndex = get(nextLeaderSlotIndexAtom);
  return nextLeaderSlotIndex
    ? leaderSlots?.[nextLeaderSlotIndex - 1]
    : undefined;
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

export const peersCountAtom = atom((get) => get(peersListAtom).length);

export const peersAtomFamily = atomFamily((peer?: string) =>
  atom((get) => (peer !== undefined ? get(peersAtom)[peer] : undefined)),
);

export const updatePeersAtom = atom(null, (_, set, peers?: Peer[]) => {
  if (!peers?.length) return;

  set(peersAtom, (draft) => {
    for (const peer of peers) {
      if (draft[peer.identity_pubkey]) {
        draft[peer.identity_pubkey] = merge(draft[peer.identity_pubkey], peer);
      } else {
        draft[peer.identity_pubkey] = peer;
      }
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

export const totalActivePeersStakeAtom = atom((get) => {
  const peerStats = get(peerStatsAtom);
  if (!peerStats) return;
  if (!(peerStats.activeStake + peerStats.delinquentStake)) return;
  return peerStats.activeStake + peerStats.delinquentStake;
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
  const totalActivePeersStake = get(totalActivePeersStakeAtom);
  const stake = get(myStakeAmountAtom);

  if (stake === undefined || !totalActivePeersStake) return;

  return (Number(stake) / Number(totalActivePeersStake)) * 100;
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
  if (!durationNanos) return 300;

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

export const [
  skippedClusterSlotsAtom,
  addSkippedClusterSlotsAtom,
  deleteSkippedClusterSlotAtom,
  deleteSkippedClusterSlotsRangeAtom,
] = (function getSkippedSlotsClusterAtom() {
  const _skippedClusterSlotsAtom = atomWithImmer(new Set<number>());
  return [
    atom((get) => get(_skippedClusterSlotsAtom)),
    atom(null, (_get, set, slots: number[]) => {
      set(_skippedClusterSlotsAtom, (draft) => {
        for (const slot of slots) {
          draft.add(slot);
        }
      });
    }),
    atom(null, (_get, set, slot: number) => {
      set(_skippedClusterSlotsAtom, (draft) => {
        draft.delete(slot);
      });
    }),

    atom(null, (_get, set, startSlot: number, endSlot: number) => {
      set(_skippedClusterSlotsAtom, (draft) => {
        const toKeep = new Set<number>();

        for (const slot of draft) {
          if (slot < startSlot || slot > endSlot) continue;
          toKeep.add(slot);
        }

        return toKeep;
      });
    }),
  ];
})();

export const serverTimeMsAtom = atom((get) => {
  const serverTimeNanos = get(serverTimeNanosAtom);
  if (serverTimeNanos == null) return undefined;
  return Math.round(serverTimeNanos / nsPerMs);
});

export const [
  discountedLateVoteSlotsAtom,
  addLateVoteSlotAtom,
  deleteLateVoteSlotAtom,
  clearLateVoteSlotsAtom,
] = (function getLateVoteSlotsAtom() {
  const _lateVotesMapAtom = atomWithImmer(new Map<number, number | null>());
  return [
    atom((get) => {
      const lateVotesMap = get(_lateVotesMapAtom);
      const skippedClusterSlots = get(skippedClusterSlotsAtom);

      const discountedLateVoteSlots = new Set<number>();

      for (const [slot, latency] of lateVotesMap) {
        if (latency === null) {
          discountedLateVoteSlots.add(slot);
          continue;
        }

        const discountedLatency = getDiscountedVoteLatency(
          slot,
          latency,
          skippedClusterSlots,
        );
        if (discountedLatency > 1) {
          discountedLateVoteSlots.add(slot);
        }
      }

      return discountedLateVoteSlots;
    }),

    atom(null, (_get, set, slot: number, latency: number | null) => {
      set(_lateVotesMapAtom, (draft) => {
        draft.set(slot, latency);
      });
    }),

    atom(null, (_get, set, slot: number) => {
      set(_lateVotesMapAtom, (draft) => {
        draft.delete(slot);
      });
    }),

    atom(null, (_get, set, keep?: { startSlot: number; endSlot: number }) => {
      set(_lateVotesMapAtom, (draft) => {
        if (!keep) {
          draft.clear();
          return;
        }

        const slotsToClear: number[] = [];
        draft.forEach((_, slot) => {
          if (slot < keep.startSlot || keep.endSlot < slot) {
            slotsToClear.push(slot);
          }
        });
        slotsToClear.forEach((slot) => draft.delete(slot));
      });
    }),
  ];
})();
