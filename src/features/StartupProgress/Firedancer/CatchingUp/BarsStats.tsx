import { Box, Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import styles from "./catchingUp.module.css";
import clsx from "clsx";
import { catchingUpStartSlotAtom, latestTurbineSlotAtom } from "./atoms";
import { completedSlotAtom } from "../../../../api/atoms";

interface CatchingUpBarsProps {
  catchingUpRatesRef: React.MutableRefObject<{
    totalSlotsEstimate?: number;
    replaySlotsPerSecond?: number;
    turbineSlotsPerSecond?: number;
  }>;
}
export function BarsStats({ catchingUpRatesRef }: CatchingUpBarsProps) {
  const startSlot = useAtomValue(catchingUpStartSlotAtom);
  const latestTurbineSlot = useAtomValue(latestTurbineSlotAtom);
  const latestReplaySlot = useAtomValue(completedSlotAtom);

  const replayRate = catchingUpRatesRef.current.replaySlotsPerSecond;
  const turbineHeadRate = catchingUpRatesRef.current.turbineSlotsPerSecond;
  const catchUpRate =
    replayRate == null || turbineHeadRate == null
      ? undefined
      : Math.round(replayRate - turbineHeadRate);

  return (
    <Box mt="3px" className={styles.barsStatsContainer}>
      <Flex justify="between" className={styles.barsStatsRow}>
        <SlotLabel
          className={styles.replayed}
          value={
            latestReplaySlot == null || startSlot == null
              ? undefined
              : latestReplaySlot - startSlot + 1
          }
          label="Slots Replayed"
        />
        <SlotLabel
          className={styles.toReplay}
          value={
            latestReplaySlot == null || latestTurbineSlot == null
              ? undefined
              : latestTurbineSlot - latestReplaySlot
          }
          label="Slots Remaining"
        />
      </Flex>
      <Flex justify="between" className={styles.barsStatsColumn}>
        <SlotLabel
          className={styles.speed}
          value={replayRate === undefined ? undefined : Math.round(replayRate)}
          label="Slots/s Replay Speed"
        />
        <SlotLabel
          className={styles.speed}
          value={catchUpRate}
          label="Slots/s Catchup Speed"
        />
      </Flex>
    </Box>
  );
}

interface SlotLabelProps {
  value: number | string | undefined;
  label: string;
  className: string;
}
function SlotLabel({ value, label, className }: SlotLabelProps) {
  return (
    <Text className={clsx(className, styles.ellipsis)}>
      <Text className={styles.bold}>{value ?? "--"} </Text>
      {label}
    </Text>
  );
}
