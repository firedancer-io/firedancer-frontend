import { Box, Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import styles from "./catchingUp.module.css";
import { catchingUpStartSlotAtom, latestTurbineSlotAtom } from "./atoms";
import { completedSlotAtom } from "../../../../api/atoms";
import type { CatchingUpRates } from "./useCatchingUpRates";

interface CatchingUpBarsProps {
  catchingUpRates: CatchingUpRates;
}
export function BarsStats({ catchingUpRates }: CatchingUpBarsProps) {
  const startSlot = useAtomValue(catchingUpStartSlotAtom);
  const latestTurbineSlot = useAtomValue(latestTurbineSlotAtom);
  const latestReplaySlot = useAtomValue(completedSlotAtom);

  const replayRate = catchingUpRates.replaySlotsPerSecond;
  const turbineHeadRate = catchingUpRates.turbineSlotsPerSecond;
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
          value={replayRate}
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
  value: number | undefined;
  label: string;
  className: string;
}
function SlotLabel({ value, label, className }: SlotLabelProps) {
  const formattedValue =
    value === undefined
      ? "--"
      : value.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        });
  return (
    <Text truncate className={className}>
      <Text className={styles.bold}>{formattedValue} </Text>
      {label}
    </Text>
  );
}
