import { atom } from "jotai";
import { bootProgressAtom } from "../../api/atoms";
import { BootPhaseEnum } from "../../api/entities";
import type { BootPhase } from "../../api/types";
import { latestTurbineSlotAtom } from "./Firedancer/CatchingUp/atoms";
import { isFrankendancer } from "../../client";

export const bootProgressPhaseAtom = atom(
  (get) => get(bootProgressAtom)?.phase,
);

type PhaseDetails = {
  phase: BootPhase;
  /** used for progress bar section width */
  barWidthFraction: number;
  /* used for calculating overall completion pct */
  completionFraction: number;
};

export const bootProgressPhaseDetailsAtom = atom((get) => {
  const phases = get(bootProgressPhasesAtom);
  const currentPhase = get(bootProgressPhaseAtom);
  return phases.find(({ phase }) => phase === currentPhase);
});

export const bootProgressHasSupermajorityPhaseAtom = atom((get) => {
  const bootProgress = get(bootProgressAtom);
  return (
    !!bootProgress?.wait_for_supermajority_bank_hash &&
    !!bootProgress?.wait_for_supermajority_shred_version
  );
});

export const bootProgressPhasesAtom = atom((get) => {
  const phases: PhaseDetails[] = get(bootProgressHasSupermajorityPhaseAtom)
    ? [
        {
          phase: BootPhaseEnum.joining_gossip,
          barWidthFraction: 0.1,
          completionFraction: 0.18,
        },
        {
          phase: BootPhaseEnum.loading_full_snapshot,
          barWidthFraction: 0.6,
          completionFraction: 0.68,
        },
        {
          phase: BootPhaseEnum.loading_incremental_snapshot,
          barWidthFraction: 0.05,
          completionFraction: 0.13,
        },
        {
          phase: BootPhaseEnum.waiting_for_supermajority,
          barWidthFraction: 0.25,
          completionFraction: 0.01,
        },
        {
          phase: BootPhaseEnum.running,
          barWidthFraction: 0,
          completionFraction: 0,
        },
      ]
    : [
        {
          phase: BootPhaseEnum.joining_gossip,
          barWidthFraction: 0.1,
          completionFraction: 0.1,
        },
        {
          phase: BootPhaseEnum.loading_full_snapshot,
          barWidthFraction: 0.6,
          completionFraction: 0.6,
        },
        {
          phase: BootPhaseEnum.loading_incremental_snapshot,
          barWidthFraction: 0.05,
          completionFraction: 0.05,
        },
        {
          phase: BootPhaseEnum.catching_up,
          barWidthFraction: 0.25,
          completionFraction: 0.25,
        },
        {
          phase: BootPhaseEnum.running,
          barWidthFraction: 0,
          completionFraction: 0,
        },
      ];

  return phases;
});

export const bootProgressCompletedPhasesAtom = atom((get) => {
  const phases = get(bootProgressPhasesAtom);
  const currentPhase = get(bootProgressPhaseAtom);

  const completed = new Set<BootPhase>();

  for (const phaseDetails of phases) {
    if (phaseDetails.phase === currentPhase) break;
    completed.add(phaseDetails.phase);
  }
  return completed;
});

export const [showStartupProgressAtom, startupFinalTurbineHeadAtom] =
  (function getShowStartupProgressAtom() {
    const _showStartupProgressAtom = atom(true);
    const _startupFinalTurbineHeadAtom = atom<number>();
    return [
      atom(
        (get) => get(_showStartupProgressAtom),
        (get, set, show: boolean) => {
          set(_showStartupProgressAtom, show);
          set(
            _startupFinalTurbineHeadAtom,
            show ? undefined : (get(latestTurbineSlotAtom) ?? -1),
          );
        },
      ),
      atom((get) => get(_startupFinalTurbineHeadAtom)),
    ];
  })();

export const isStartupProgressExpandedAtom = atom(true);
export const expandStartupProgressElAtom = atom<HTMLButtonElement | null>(null);

export const isStartupProgressVisibleAtom = atom((get) => {
  const showStartupProgress = get(showStartupProgressAtom);
  if (!showStartupProgress) return false;

  if (isFrankendancer) {
    return showStartupProgress;
  } else {
    return showStartupProgress && get(isStartupProgressExpandedAtom);
  }
});

export const snapshotSlotAtom = atom<number | null | undefined>((get) => {
  return (
    get(bootProgressAtom)?.loading_incremental_snapshot_slot ??
    get(bootProgressAtom)?.loading_full_snapshot_slot
  );
});
