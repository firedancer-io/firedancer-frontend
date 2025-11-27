import styles from "./phaseHeader.module.css";
import { useEffect, useMemo, useState } from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { ProgressBar } from "./ProgressBar";
import { getDurationText, getTimeTillText } from "../../../../utils";

import { steps } from "../consts";
import type { BootPhase } from "../../../../api/types";

import { useUptimeDuration } from "../../../../hooks/useUptime";
import { Duration } from "luxon";
import { clamp } from "lodash";
import { useThrottledCallback } from "use-debounce";

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
  phaseCompletePct: number;
  remainingSeconds?: number;
}
export default function PhaseHeader({
  phase,
  phaseCompletePct,
  remainingSeconds,
}: PhaseHeaderProps) {
  const [remaining, setRemaining] = useState<number>();
  const setRemainingThrottled = useThrottledCallback((value?: number) => {
    const updatedRemaining =
      remainingSeconds == null
        ? undefined
        : Math.max(Math.round(remainingSeconds), 0);
    setRemaining(updatedRemaining);
  }, 1_000);

  useEffect(() => {
    setRemainingThrottled(remainingSeconds);
  }, [setRemainingThrottled, remainingSeconds]);

  const formattedRemaining = useMemo(() => {
    if (remaining == null) return undefined;

    return getDurationText(
      Duration.fromObject({
        seconds: remaining,
      }).rescale(),
      { showOnlyTwoSignificantUnits: true },
    );
  }, [remaining]);

  const step = steps[phase];

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
    prevPhasesPctSum +
    Math.round(step.estimatedPct * clamp(phaseCompletePct, 0, 100));

  return (
    <Box flexShrink="0">
      <Flex
        justify="between"
        mt="7"
        mb="2"
        gapX="8px"
        wrap="wrap"
        className={styles.stepContainer}
      >
        <span className={styles.noWrap}>
          <Text className={styles.secondaryText}>Elapsed </Text>
          <TotalDuration />
        </span>
        <span>
          <Text className={styles.stepName}>{step.name}... </Text>
          {formattedRemaining && (
            <span className={styles.noWrap}>
              <Text className={styles.secondaryText}>Remaining </Text>
              <Text style={{ display: "inline-block", minWidth: "120px" }}>
                ~{formattedRemaining}
              </Text>
            </span>
          )}
        </span>
        <span className={styles.noWrap}>
          <Text className={styles.secondaryText}>Complete </Text>
          <Text>{overallPct}%</Text>
        </span>
      </Flex>

      <ProgressBar stepIndex={step.index} phaseCompletePct={phaseCompletePct} />
    </Box>
  );
}
