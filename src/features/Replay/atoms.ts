import type { TsRange } from "../WebGl/webglUtils";
import { atom } from "jotai";

export const { referenceNsAtom, visibleRangeAtom, worldRangeAtom } =
  (function getReplayChartAtoms() {
    const _referenceNsAtom = atom<bigint | undefined>();
    const _visibleRangeAtom = atom<TsRange | undefined>(undefined);
    const _worldRangeAtom = atom<TsRange | undefined>(undefined);

    const isInitializedAtom = atom((get) => {
      return (
        get(_referenceNsAtom) != null &&
        !!get(_visibleRangeAtom) &&
        !!get(_worldRangeAtom)
      );
    });

    return {
      referenceNsAtom: atom(
        (get) => (get(isInitializedAtom) ? get(_referenceNsAtom) : undefined),
        (_, set, value: bigint) => set(_referenceNsAtom, value),
      ),
      visibleRangeAtom: atom(
        (get) => (get(isInitializedAtom) ? get(_visibleRangeAtom) : undefined),
        (_, set, value: TsRange) => {
          set(_visibleRangeAtom, (prev) => {
            if (prev && prev[0] === value[0] && prev[1] === value[1])
              return prev;
            return value;
          });
        },
      ),
      worldRangeAtom: atom(
        (get) => (get(isInitializedAtom) ? get(_worldRangeAtom) : undefined),
        (_, set, value: TsRange) =>
          set(_worldRangeAtom, (prev) => {
            if (prev && prev[0] === value[0] && prev[1] === value[1])
              return prev;
            return value;
          }),
      ),
    };
  })();

export const selectedMsAtom = atom<number | undefined>();
