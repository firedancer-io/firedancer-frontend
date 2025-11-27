import { Flex } from "@radix-ui/themes";
import styles from "./progressBar.module.css";
import { BootPhaseEnum } from "../../../../api/entities";
import { steps } from "../consts";

interface ProgressBarProps {
  stepIndex: number;
  phaseCompletePct: number;
}

export function ProgressBar({ stepIndex, phaseCompletePct }: ProgressBarProps) {
  return (
    <Flex className={styles.progressBar}>
      {Object.entries(steps).map(
        (
          [
            phase,
            {
              name,
              estimatedPct,
              completeColor,
              inProgressBackground,
              incompleteColor,
              borderColor,
            },
          ],
          i,
        ) => {
          if (phase === BootPhaseEnum.running) return;

          const width = `${estimatedPct * 100}%`;

          if (i === stepIndex) {
            return (
              <div
                className={styles.currentStep}
                key={name}
                style={{
                  width,
                  background: incompleteColor,
                  borderColor,
                }}
              >
                <div
                  className={styles.progressingBar}
                  style={{
                    transform: `scaleX(${phaseCompletePct / 100})`,
                    background: inProgressBackground,
                  }}
                />
              </div>
            );
          }

          const isComplete = i < stepIndex;
          return (
            <div
              key={name}
              style={{
                width,
                backgroundColor: isComplete ? completeColor : incompleteColor,
              }}
            />
          );
        },
      )}
    </Flex>
  );
}
