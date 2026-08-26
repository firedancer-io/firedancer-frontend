import { Flex } from "@radix-ui/themes";
import styles from "./progressBar.module.css";
import { BootPhaseEnum } from "../../../../api/entityEnums";
import { useAtomValue } from "jotai";
import {
  bootProgressCompletedPhasesAtom,
  bootProgressPhaseAtom,
  bootProgressPhasesAtom,
} from "../../atoms";
import clamp from "lodash/clamp";
import clsx from "clsx";
import type { BootPhase } from "../../../../api/types";
import { useEffect, useState } from "react";

const classNames: { [phase in BootPhase]: string } = {
  [BootPhaseEnum.joining_gossip]: styles.gossip,
  [BootPhaseEnum.loading_full_snapshot]: styles.fullSnapshot,
  [BootPhaseEnum.loading_incremental_snapshot]: styles.incrSnapshot,
  [BootPhaseEnum.catching_up]: styles.catchingUp,
  [BootPhaseEnum.waiting_for_supermajority]: styles.supermajority,
  [BootPhaseEnum.running]: "",
};

interface ProgressBarProps {
  phaseCompleteFraction: number;
}

export function ProgressBar({ phaseCompleteFraction }: ProgressBarProps) {
  // first render paints directly at the live fraction (no transition on a
  // fresh element); later updates keep the CSS-transitioned animation
  const [displayFraction, setDisplayFraction] = useState(() =>
    clamp(phaseCompleteFraction, 0, 1),
  );

  useEffect(() => {
    setDisplayFraction(clamp(phaseCompleteFraction, 0, 1));
  }, [phaseCompleteFraction]);

  const currentPhase = useAtomValue(bootProgressPhaseAtom);
  const phases = useAtomValue(bootProgressPhasesAtom);
  const completedPhases = useAtomValue(bootProgressCompletedPhasesAtom);

  return (
    <Flex className={styles.progressBar}>
      {phases.map(({ phase, completionFraction }) => {
        if (phase === BootPhaseEnum.running) return;

        const isCurrent = phase === currentPhase;

        const width = `${completionFraction * 100}%`;

        return (
          <div
            key={phase}
            className={clsx(classNames[phase], {
              [styles.current]: isCurrent,
              [styles.complete]: completedPhases.has(phase),
            })}
            style={{ width }}
          >
            {isCurrent && (
              <div
                className={styles.progressingBar}
                style={{
                  transform: `scaleX(${displayFraction})`,
                }}
              />
            )}
          </div>
        );
      })}
    </Flex>
  );
}
