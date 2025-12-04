import { Flex, Text } from "@radix-ui/themes";
import { CatchingUpBars } from "./CatchingUpBars";
import { BarsFooter } from "./BarsFooter";
import BarsLabels from "./BarsLabels";
import { useAtomValue, useSetAtom } from "jotai";
import {
  catchingUpContainerElAtom,
  catchingUpStartSlotAtom,
  hasCatchingUpDataAtom,
  latestTurbineSlotAtom,
} from "./atoms";
import ShredsChart from "../../../Overview/ShredsProgression/ShredsChart";
import styles from "./catchingUp.module.css";
import bodyStyles from "../body.module.css";
import CatchingUpTiles from "./CatchingUpTiles";
import PhaseHeader from "../PhaseHeader";
import useEstimateTotalSlots from "./useCatchingUpRates";
import { BarsStats } from "./BarsStats";
import { ShredsChartLegend } from "../../../Overview/ShredsProgression/ShredsChartLegend";
import { completedSlotAtom } from "../../../../api/atoms";
import { useMemo } from "react";

export default function CatchingUp() {
  const setContainerEl = useSetAtom(catchingUpContainerElAtom);
  const hasCatchingUpData = useAtomValue(hasCatchingUpDataAtom);
  const catchingUpRatesRef = useEstimateTotalSlots();

  const startSlot = useAtomValue(catchingUpStartSlotAtom);
  const latestTurbineSlot = useAtomValue(latestTurbineSlotAtom);
  const latestReplaySlot = useAtomValue(completedSlotAtom);

  const phaseCompletePct = useMemo(() => {
    if (
      startSlot == null ||
      latestTurbineSlot == null ||
      latestReplaySlot == null
    ) {
      return 0;
    }

    const totalSlotsToReplay = latestTurbineSlot - startSlot + 1;
    if (!totalSlotsToReplay) return 0;

    const replayedSlots = latestReplaySlot - startSlot + 1;
    return (100 * replayedSlots) / totalSlotsToReplay;
  }, [latestReplaySlot, latestTurbineSlot, startSlot]);
  return (
    <>
      <PhaseHeader
        phase="catching_up"
        phaseCompletePct={phaseCompletePct}
        remainingSeconds={catchingUpRatesRef.current.remainingSeconds}
      />
      <Flex
        direction="column"
        height="100%"
        mt="8px"
        gap="8px"
        className={bodyStyles.startupContentIndentation}
      >
        {hasCatchingUpData && (
          <Flex ref={setContainerEl} direction="column" gap="5px">
            <BarsLabels />
            <CatchingUpBars catchingUpRatesRef={catchingUpRatesRef} />
            <BarsFooter />
            <BarsStats catchingUpRates={catchingUpRatesRef.current} />
          </Flex>
        )}

        <Flex direction="column" className={styles.card} mb="14px">
          <Flex gapX="15px" gapY="2" align="center" wrap="wrap">
            <Text className={styles.title}>Shreds</Text>
            <ShredsChartLegend />
          </Flex>
          <ShredsChart
            flexGrow="1"
            minHeight="280px"
            chartId="catching-up-shreds"
            isOnStartupScreen
          />
        </Flex>

        <CatchingUpTiles />
      </Flex>
    </>
  );
}
