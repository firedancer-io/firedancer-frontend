import { useAtomValue } from "jotai";
import {
  bootProgressCompletedPhasesAtom,
  bootProgressPhaseDetailsAtom,
  bootProgressPhasesAtom,
} from "../atoms";
import { useMemo } from "react";
import { clamp, sum } from "lodash";

export function useOverallCompleteFraction(
  currentPhaseCompleteFraction: number,
) {
  const currentPhaseDetails = useAtomValue(bootProgressPhaseDetailsAtom);
  const phases = useAtomValue(bootProgressPhasesAtom);
  const completedPhases = useAtomValue(bootProgressCompletedPhasesAtom);

  return useMemo(() => {
    if (!currentPhaseDetails) return 0;

    return sum(
      phases.map((p) => {
        if (p === currentPhaseDetails)
          return (
            p.completionFraction * clamp(currentPhaseCompleteFraction, 0, 1)
          );
        if (completedPhases.has(p.phase)) return p.completionFraction;
        return 0;
      }),
    );
  }, [
    completedPhases,
    currentPhaseCompleteFraction,
    currentPhaseDetails,
    phases,
  ]);
}
