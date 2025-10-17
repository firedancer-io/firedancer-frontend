import { atom } from "jotai";
import { bootProgressAtom, completedSlotAtom } from "../../api/atoms";
import { BootPhaseEnum, ClientEnum } from "../../api/entities";
import type { BootProgress } from "../../api/types";
import { clientAtom } from "../../atoms";

export const bootProgressPhaseAtom = atom<BootProgress["phase"] | undefined>(
  (get) => get(bootProgressAtom)?.phase,
);

export const showStartupProgressAtom = atom(true);
export const isStartupProgressExpandedAtom = atom(true);
export const expandStartupProgressElAtom = atom<HTMLButtonElement | null>(null);

export const isStartupProgressVisibleAtom = atom((get) => {
  const showStartupProgress = get(showStartupProgressAtom);
  if (!showStartupProgress) return false;

  const client = get(clientAtom);
  if (client === ClientEnum.Frankendancer) {
    return showStartupProgress;
  } else if (client === ClientEnum.Firedancer) {
    return showStartupProgress && get(isStartupProgressExpandedAtom);
  }
  return true;
});

export const bootProgressBarPctAtom = atom((get) => {
  const bootProgress = get(bootProgressAtom);
  if (!bootProgress) return 0;

  switch (bootProgress.phase) {
    case BootPhaseEnum.joining_gossip: {
      return 0;
    }
    case BootPhaseEnum.loading_full_snapshot: {
      const total = bootProgress.loading_full_snapshot_total_bytes_compressed;
      const insert =
        bootProgress.loading_full_snapshot_insert_bytes_decompressed;
      const decompress_compressed =
        bootProgress.loading_full_snapshot_decompress_bytes_compressed;
      const decompress_decompressed =
        bootProgress.loading_full_snapshot_decompress_bytes_decompressed;

      if (
        !insert ||
        !decompress_compressed ||
        !decompress_decompressed ||
        !total
      ) {
        return 0;
      }

      const insertCompleted =
        insert * (decompress_compressed / decompress_decompressed);

      return Math.min(100, (insertCompleted / total) * 100);
    }
    case BootPhaseEnum.loading_incremental_snapshot: {
      const total =
        bootProgress.loading_incremental_snapshot_total_bytes_compressed;
      const insert =
        bootProgress.loading_incremental_snapshot_insert_bytes_decompressed;
      const decompress_compressed =
        bootProgress.loading_incremental_snapshot_decompress_bytes_decompressed;
      const decompress_decompressed =
        bootProgress.loading_incremental_snapshot_decompress_bytes_decompressed;

      if (
        !insert ||
        !decompress_compressed ||
        !decompress_decompressed ||
        !total
      ) {
        return 0;
      }

      const insertCompleted =
        insert * (decompress_compressed / decompress_decompressed);

      return Math.min(100, (insertCompleted / total) * 100);
    }
    case BootPhaseEnum.catching_up: {
      const catchingUpData = get(catchingUpDataAtom);
      if (!catchingUpData) return 0;

      const { startSlot, latestReplaySlot, latestTurbineSlot } = catchingUpData;

      const totalSlotsToReplay = latestTurbineSlot - startSlot + 1;
      if (!totalSlotsToReplay) return 0;

      const replayedSlots = latestReplaySlot
        ? latestReplaySlot - startSlot + 1
        : 0;

      return (100 * replayedSlots) / totalSlotsToReplay;
    }
    case BootPhaseEnum.running: {
      return 0;
    }
  }
});

export const turbineBarIndicesAtom = atom<{
  first: number;
  latest: number;
}>();

export interface CatchingUpData {
  startSlot: number;
  repairSlots: Set<number>;
  latestReplaySlot: number;
  firstTurbineSlot: number;
  latestTurbineSlot: number;
  turbineSlots: Set<number>;
}

export const catchingUpDataAtom = atom<CatchingUpData | undefined>((get) => {
  const startSlot =
    get(bootProgressAtom)?.loading_incremental_snapshot_slot ??
    get(bootProgressAtom)?.loading_full_snapshot_slot;
  const turbineSlots = get(turbineSlotsAtom);
  const firstTurbineSlot = get(firstTurbineSlotAtom);
  const latestTurbineSlot = get(latestTurbineSlotAtom);
  const latestReplaySlot = get(completedSlotAtom) ?? 0;
  const repairSlots = get(repairSlotsAtom);

  if (
    startSlot == null ||
    !turbineSlots.size ||
    firstTurbineSlot == null ||
    latestTurbineSlot == null
  )
    return;

  return {
    startSlot,
    repairSlots,
    latestReplaySlot,
    firstTurbineSlot,
    latestTurbineSlot,
    turbineSlots,
  };
});

export const [
  turbineSlotsAtom,
  addTurbineSlotAtom,
  firstTurbineSlotAtom,
  latestTurbineSlotAtom,
] = (function getTurbineAtoms() {
  const _turbineSlotsAtom = atom<Set<number>>(new Set<number>());
  const _firstTurbineSlotAtom = atom<number | undefined>();
  const _latestTurbineSlotAtom = atom<number | undefined>();

  return [
    atom((get) => get(_turbineSlotsAtom)),
    atom(null, (get, set, slots: number[]) => {
      set(_turbineSlotsAtom, (prev) => {
        slots.forEach((slot) => {
          prev.add(slot);
          set(_firstTurbineSlotAtom, (first) =>
            first ? Math.min(first, slot) : slot,
          );
          set(_latestTurbineSlotAtom, (latest) =>
            latest ? Math.max(latest, slot) : slot,
          );
        });
        return prev;
      });
    }),
    atom((get) => get(_firstTurbineSlotAtom)),
    atom((get) => get(_latestTurbineSlotAtom)),
  ];
})();

export const [repairSlotsAtom, addRepairSlotAtom] =
  (function getTurbineAtoms() {
    const _repairSlotsAtom = atom<Set<number>>(new Set<number>());
    return [
      atom((get) => get(_repairSlotsAtom)),
      atom(null, (get, set, slots: number[]) => {
        set(_repairSlotsAtom, (prev) => {
          slots.forEach((slot) => {
            prev.add(slot);
          });
          return prev;
        });
      }),
    ];
  })();
