import type {
  CurrentSlotRange,
  SlotLane,
  SlotLaneId,
  SlotTimelineValues,
} from "./types";

export const minCurrentSlotCount = 13;
export const maxCurrentSlotCount = 48;
export const maxFutureSlotCellCount = 48;

const colors = {
  storage: "#A09000",
  root: "#0ABF9E",
  vote: "#4AA7C1",
  replay: "#08A24D",
  repair: "#AC4902",
  turbine: "#3F7BF4",
  confirmed: "#AF49F2",
  finalized: "#0ABF9E",
  nextLeader: "#2497EE",
} satisfies Record<SlotLaneId, string>;

type OptionalSlotLane = Omit<SlotLane, "slot"> & {
  slot: number | null | undefined;
};

/* A lane with no slot yet is not worth a row - except next leader, which
   is kept so that a validator that will never lead says so rather than
   silently losing the row. */
function removeUnavailableLanes(lanes: OptionalSlotLane[]): SlotLane[] {
  return lanes
    .filter((lane) => lane.slot != null || lane.id === "nextLeader")
    .map((lane) => ({ ...lane, slot: lane.slot ?? null }));
}

export function getSlotLanes(values: SlotTimelineValues): SlotLane[] {
  const {
    isAlpenglow,
    nextLeaderSlot,
    turbineSlot,
    repairSlot,
    replaySlot,
    voteSlot,
    optimisticallyConfirmedSlot,
    rootSlot,
    finalizedSlot,
    storageSlot,
  } = values;

  if (isAlpenglow) {
    return removeUnavailableLanes([
      {
        id: "nextLeader",
        label: "Next Leader",
        slot: nextLeaderSlot,
        color: colors.nextLeader,
      },
      {
        id: "turbine",
        label: "Rotor",
        slot: turbineSlot,
        color: colors.turbine,
      },
      {
        id: "repair",
        label: "Repair",
        slot: repairSlot,
        color: colors.repair,
      },
      {
        id: "replay",
        label: "Replayed",
        slot: replaySlot,
        color: colors.replay,
        isReference: true,
      },
      {
        id: "vote",
        label: "Confirmed",
        slot: voteSlot,
        color: colors.confirmed,
      },
      {
        id: "finalized",
        label: "Finalized",
        slot: finalizedSlot,
        color: colors.finalized,
      },
      {
        id: "storage",
        label: "Storage",
        slot: storageSlot,
        color: colors.storage,
      },
    ]);
  }

  return removeUnavailableLanes([
    {
      id: "nextLeader",
      label: "Next Leader",
      slot: nextLeaderSlot,
      color: colors.nextLeader,
    },
    {
      id: "turbine",
      label: "Turbine",
      slot: turbineSlot,
      color: colors.turbine,
    },
    {
      id: "repair",
      label: "Repair",
      slot: repairSlot,
      color: colors.repair,
    },
    {
      id: "replay",
      label: "Processed",
      slot: replaySlot,
      color: colors.replay,
      isReference: true,
    },
    {
      id: "vote",
      label: "Voted",
      slot: voteSlot,
      color: colors.vote,
    },
    {
      id: "confirmed",
      label: "Confirmed",
      slot: optimisticallyConfirmedSlot,
      color: colors.confirmed,
    },
    {
      id: "root",
      label: "Root",
      slot: rootSlot,
      color: colors.root,
    },
    {
      id: "storage",
      label: "Storage",
      slot: storageSlot,
      color: colors.storage,
    },
  ]);
}

export function getCurrentSlotRange(
  lanes: SlotLane[],
  referenceSlot: number,
): CurrentSlotRange {
  const currentSlots = lanes
    .filter(({ id }) => id !== "nextLeader")
    .map(({ slot }) => slot)
    .filter((slot): slot is number => slot != null);
  const maxSlot = Math.max(referenceSlot, ...currentSlots);
  const oldestSlot = Math.min(referenceSlot, ...currentSlots);
  const paddedMinSlot = Math.max(0, maxSlot - minCurrentSlotCount + 1);
  const desiredMinSlot = Math.min(oldestSlot, paddedMinSlot);
  const minSlot = Math.max(
    0,
    maxSlot - maxCurrentSlotCount + 1,
    desiredMinSlot,
  );

  return {
    minSlot,
    maxSlot,
    slots: Array.from(
      { length: maxSlot - minSlot + 1 },
      (_, index) => minSlot + index,
    ),
  };
}

/* Null means we will never lead, which still gets the column - the card
   keeps its usual shape and the header reads "never" where the slot
   number would be.  Undefined means no lane at all.  A slot already
   inside the current range is marked there, so a column would only
   duplicate it. */
export function shouldShowNextLeaderColumn(
  nextLeaderSlot: number | null | undefined,
  maxCurrentSlot: number,
) {
  if (nextLeaderSlot === null) return true;
  if (nextLeaderSlot === undefined) return false;
  return nextLeaderSlot > maxCurrentSlot;
}

/* Null and undefined mean different things here.  Null is "we will never
   lead", where the future runs on with nothing at the end of it, so the
   section is filled rather than measured.  Undefined is "no lane at
   all", which draws nothing. */
export function getFutureSlotCellCount(
  maxCurrentSlot: number,
  nextLeaderSlot: number | null | undefined,
) {
  if (nextLeaderSlot === null) return maxFutureSlotCellCount;
  if (nextLeaderSlot === undefined) return 0;
  return Math.min(
    Math.max(nextLeaderSlot - maxCurrentSlot - 1, 0),
    maxFutureSlotCellCount,
  );
}
