import styles from "./phaseHeader.module.css";
import { useEffect, useMemo, useState } from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { ProgressBar } from "./ProgressBar";
import { getDurationText, getTimeTillText } from "../../../../utils";
import type { BootPhase } from "../../../../api/types";

import { useUptimeDuration } from "../../../../hooks/useUptime";
import { Duration } from "luxon";
import { useThrottledCallback } from "use-debounce";
import { clamp } from "lodash";
import { BootPhaseEnum } from "../../../../api/entities";

const phaseNames: Record<BootPhase, string> = {
  [BootPhaseEnum.joining_gossip]: "Joining Gossip",
  [BootPhaseEnum.loading_full_snapshot]: "Loading Full Snapshot",
  [BootPhaseEnum.loading_incremental_snapshot]: "Loading Incremental Snapshot",
  [BootPhaseEnum.catching_up]: "Catching Up",
  [BootPhaseEnum.running]: "Running",
};

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
  phaseCompleteFraction: number;
  overallCompleteFraction: number;
  remainingSeconds?: number;
}
export default function PhaseHeader({
  phase,
  phaseCompleteFraction,
  overallCompleteFraction,
  remainingSeconds,
}: PhaseHeaderProps) {
  const [remaining, setRemaining] = useState<number>();

  const setRemainingThrottled = useThrottledCallback((value?: number) => {
    const updatedRemaining =
      value == null ? undefined : Math.max(Math.round(value), 0);
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

  const overallCompletePct = clamp(
    Math.round(overallCompleteFraction * 100),
    0,
    100,
  );

  return (
    <Box flexShrink="0" className={styles.phaseHeaderContainer}>
      <Flex justify="between" mt="7" mb="2" gapX="8px" wrap="wrap">
        <span className={styles.noWrap}>
          <Text className={styles.secondaryText}>Elapsed </Text>
          <TotalDuration />
        </span>
        <span>
          <Text className={styles.phaseName}>{phaseNames[phase]}... </Text>
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
          <Text>{overallCompletePct}%</Text>
        </span>
      </Flex>

      <ProgressBar phaseCompleteFraction={phaseCompleteFraction} />
    </Box>
  );
}
