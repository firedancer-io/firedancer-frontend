import { atom } from "jotai";
import { bootProgressAtom } from "../../../../api/atoms";
import { atomWithImmer } from "jotai-immer";

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

export const [
  turbineSlotsAtom,
  addTurbineSlotsAtom,
  firstTurbineSlotAtom,
  latestTurbineSlotAtom,
] = (function getTurbineAtoms() {
  const _turbineSlotsAtom = atomWithImmer<Set<number>>(new Set<number>());
  const _firstTurbineSlotAtom = atom<number>();
  const _latestTurbineSlotAtom = atom<number>();

  return [
    atom((get) => get(_turbineSlotsAtom)),
    atom(null, (_get, set, slots: number[]) => {
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

export const [repairSlotsAtom, addRepairSlotsAtom] =
  (function getRepairAtoms() {
    const _repairSlotsAtom = atomWithImmer<Set<number>>(new Set<number>());
    return [
      atom((get) => get(_repairSlotsAtom)),
      atom(null, (_get, set, slots: number[]) => {
        set(_repairSlotsAtom, (prev) => {
          slots.forEach((slot) => {
            prev.add(slot);
          });
          return prev;
        });
      }),
    ];
  })();
