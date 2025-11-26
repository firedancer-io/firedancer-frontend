import { useAtomValue } from "jotai";
import styles from "./body.module.css";
import { useMemo } from "react";
import { bootProgressBarPctAtom } from "../atoms";
import { Box, Flex, Text } from "@radix-ui/themes";
import { ProgressBar } from "./ProgressBar";
import { getTimeTillText } from "../../../utils";

import { steps } from "./consts";
import type { BootPhase } from "../../../api/types";

import { useUptimeDuration } from "../../../hooks/useUptime";

function TotalDuration() {
  const uptimeDuration = useUptimeDuration(1_000);

  return (
    <Text>
      {uptimeDuration == null ? "--" : getTimeTillText(uptimeDuration)}
    </Text>
  );
}

interface PhaseHeaderProps {
  phase: BootPhase;
}
export function PhaseHeader({ phase }: PhaseHeaderProps) {
  const step = steps[phase];
  const phasePct = useAtomValue(bootProgressBarPctAtom);

  const prevPhasesPctSum = useMemo(() => {
    return (
      Object.values(steps).reduce((acc, { index, estimatedPct }) => {
        if (index < step.index) {
          acc += estimatedPct;
        }
        return acc;
      }, 0) * 100
    );
  }, [step]);

  const overallPct =
    prevPhasesPctSum + Math.round(step.estimatedPct * phasePct);

  return (
    <Box flexShrink="0">
      <Flex justify="between" mt="7" mb="2" className={styles.stepContainer}>
        <span>
          <Text className={styles.secondaryText}>Elapsed </Text>
          <TotalDuration />
        </span>
        <Text className={styles.stepName}>{step.name}</Text>
        <span>
          <Text className={styles.secondaryText}>Complete </Text>
          <Text>{overallPct}% </Text>
        </span>
      </Flex>

      <ProgressBar stepIndex={step.index} />
    </Box>
  );
}
