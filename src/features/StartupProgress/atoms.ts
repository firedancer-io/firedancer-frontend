import { atom } from "jotai";
import { bootProgressAtom } from "../../api/atoms";
import { BootPhaseEnum } from "../../api/entityEnums";
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

// Same-commit view of "startup UI showing": keys off the phase directly,
// where the showStartupProgressAtom mirror updates in an effect a commit
// later; an unknown phase counts as startup (shell still dark)
export const isStartupPhaseAtom = atom((get) =>
  isFrankendancer
    ? get(showStartupProgressAtom)
    : get(bootProgressPhaseAtom) !== BootPhaseEnum.running,
);

// Header startup buttons: hidden until the phase is known (unlike
// isStartupPhaseAtom, which counts unknown as startup), so a running
// validator never paints them for a beat before the mirror catches up
export const showStartupButtonsAtom = atom((get) => {
  if (isFrankendancer) return get(showStartupProgressAtom);
  const phase = get(bootProgressPhaseAtom);
  return phase !== undefined && phase !== BootPhaseEnum.running;
});

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
