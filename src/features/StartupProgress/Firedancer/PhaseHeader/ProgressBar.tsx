import { Flex } from "@radix-ui/themes";
import styles from "./progressBar.module.css";
import { BootPhaseEnum } from "../../../../api/entities";
import { useAtomValue } from "jotai";
import {
  bootProgressCompletedPhasesAtom,
  bootProgressPhaseAtom,
  bootProgressPhasesAtom,
} from "../../atoms";
import { clamp } from "lodash";
import clsx from "clsx";
import type { BootPhase } from "../../../../api/types";
import { useEffect, useRef } from "react";

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
  // initialize animation at 0
  const currentCompleteFractionRef = useRef(0);

  useEffect(() => {
    currentCompleteFractionRef.current = phaseCompleteFraction;
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
                  transform: `scaleX(${clamp(currentCompleteFractionRef.current, 0, 1)})`,
                }}
              />
            )}
          </div>
        );
      })}
    </Flex>
  );
}
