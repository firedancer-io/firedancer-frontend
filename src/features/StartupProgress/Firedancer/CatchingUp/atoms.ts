import { atom } from "jotai";
import { bootProgressAtom } from "../../../../api/atoms";
import { atomWithImmer } from "jotai-immer";
import { showStartupProgressAtom } from "../../atoms";

export const catchingUpContainerElAtom = atom<HTMLDivElement | null>(null);

export interface CatchingUpData {
  startSlot: number;
  repairSlots: Set<number>;
  turbineSlots: Set<number>;
  firstTurbineSlot: number;
  latestTurbineSlot: number;
  latestReplaySlot: number | undefined;
}

export const catchingUpStartSlotAtom = atom<number | null | undefined>(
  (get) => {
    return (
      get(bootProgressAtom)?.loading_incremental_snapshot_slot ??
      get(bootProgressAtom)?.loading_full_snapshot_slot
    );
  },
);

export const hasCatchingUpDataAtom = atom((get) => {
  const startSlot = get(catchingUpStartSlotAtom);
  const turbineSlots = get(turbineSlotsAtom);
  return startSlot != null && !!turbineSlots.size;
});

/**
 * Only collected during startup, and reset at end of startup
 */
export const [
  turbineSlotsAtom,
  addTurbineSlotsAtom,
  firstTurbineSlotAtom,
  latestTurbineSlotAtom,
  resetTurbineSlotsAtom,
] = (function getTurbineAtoms() {
  const _turbineSlotsAtom = atomWithImmer<Set<number>>(new Set<number>());
  const _firstTurbineSlotAtom = atom<number>();
  const _latestTurbineSlotAtom = atom<number>();

  return [
    atom((get) => get(_turbineSlotsAtom)),
    atom(null, (get, set, slots: number[]) => {
      if (!get(showStartupProgressAtom)) return;

      set(_turbineSlotsAtom, (draft) => {
        slots.forEach((slot) => {
          draft.add(slot);

          set(_firstTurbineSlotAtom, (first) =>
            first ? Math.min(first, slot) : slot,
          );

          set(_latestTurbineSlotAtom, (latest) =>
            latest ? Math.max(latest, slot) : slot,
          );
        });
      });
    }),
    atom((get) => get(_firstTurbineSlotAtom)),
    atom((get) => get(_latestTurbineSlotAtom)),
    atom(null, (_get, set) => {
      set(_firstTurbineSlotAtom, undefined);
      set(_latestTurbineSlotAtom, undefined);
      set(_turbineSlotsAtom, new Set());
    }),
  ];
})();

/**
 * Only collected during startup, and reset at end of startup
 */
export const [repairSlotsAtom, addRepairSlotsAtom, resetRepairSlotsAtom] =
  (function getRepairAtoms() {
    const _repairSlotsAtom = atomWithImmer<Set<number>>(new Set<number>());
    return [
      atom((get) => get(_repairSlotsAtom)),
      atom(null, (get, set, slots: number[]) => {
        if (!get(showStartupProgressAtom)) return;

        set(_repairSlotsAtom, (draft) => {
          slots.forEach((slot) => {
            draft.add(slot);
          });
        });
      }),
      atom(null, (_get, set) => {
        set(_repairSlotsAtom, new Set());
      }),
    ];
  })();
