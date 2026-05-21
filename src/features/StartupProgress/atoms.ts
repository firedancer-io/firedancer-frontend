import { atom } from "jotai";
import { bootProgressAtom } from "../../api/atoms";
import { BootPhaseEnum } from "../../api/entities";
import type { BootPhase } from "../../api/types";
import { isFrankendancer } from "../../client";

export const bootProgressPhaseAtom = atom(
  (get) => get(bootProgressAtom)?.phase,
);

type PhaseDetails = {
  phase: BootPhase;
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
          completionFraction: 0.1,
        },
        {
          phase: BootPhaseEnum.loading_full_snapshot,
          completionFraction: 0.6,
        },
        {
          phase: BootPhaseEnum.loading_incremental_snapshot,
          completionFraction: 0.05,
        },
        {
          phase: BootPhaseEnum.waiting_for_supermajority,
          completionFraction: 0.25,
        },
        {
          phase: BootPhaseEnum.running,
          completionFraction: 0,
        },
      ]
    : [
        {
          phase: BootPhaseEnum.joining_gossip,
          completionFraction: 0.1,
        },
        {
          phase: BootPhaseEnum.loading_full_snapshot,
          completionFraction: 0.6,
        },
        {
          phase: BootPhaseEnum.loading_incremental_snapshot,
          completionFraction: 0.05,
        },
        {
          phase: BootPhaseEnum.catching_up,
          completionFraction: 0.25,
        },
        {
          phase: BootPhaseEnum.running,
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

export const showStartupProgressAtom = atom(true);

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
