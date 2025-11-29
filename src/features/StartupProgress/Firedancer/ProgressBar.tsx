import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { bootProgressBarPctAtom } from "../atoms";
import styles from "./progressBar.module.css";
import { steps } from "./consts";
import { BootPhaseEnum } from "../../../api/entities";

interface ProgressBarProps {
  stepIndex: number;
}

export function ProgressBar({ stepIndex }: ProgressBarProps) {
  const pctComplete = useAtomValue(bootProgressBarPctAtom);

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
                    transform: `scaleX(${pctComplete / 100})`,
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
