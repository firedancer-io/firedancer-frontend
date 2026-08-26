import { Box, Flex, Text } from "@radix-ui/themes";
import type { CatchingUpBars } from "./CatchingUpBars";
import { BarsFooter } from "./BarsFooter";
import BarsLabels from "./BarsLabels";
import { useAtomValue, useSetAtom } from "jotai";
import {
  catchingUpContainerElAtom,
  catchingUpStartSlotAtom,
  hasCatchingUpDataAtom,
  latestTurbineSlotAtom,
} from "./atoms";
import styles from "./catchingUp.module.css";
import bodyStyles from "../body.module.css";
import CatchingUpTiles from "./CatchingUpTiles";
import PhaseHeader from "../PhaseHeader";
import useEstimateTotalSlots from "./useCatchingUpRates";
import { BarsStats } from "./BarsStats";
import { ShredsChartLegend } from "../../../Overview/ShredsProgression/ShredsChartLegend";
import { completedSlotAtom } from "../../../../api/atoms";
import { startTransition, useEffect, useMemo, useState } from "react";
import type { ComponentProps, ComponentType } from "react";
import { useOverallCompleteFraction } from "../useOverallCompleteFraction";
import clamp from "lodash/clamp";
// Deferred (preload-and-reveal, not lazy/Suspense, so mounting under
// catch-up data flushes can't starve in Suspense retry lanes): keeps
// uplot out of the main chunk
import ShredsChart from "../../../Overview/ShredsProgression/ShredsChartDeferred";

type CatchingUpBarsProps = ComponentProps<typeof CatchingUpBars>;
let catchingUpBars: ComponentType<CatchingUpBarsProps> | undefined;

// preload-and-reveal (same contract as the deferred shreds chart);
// keeps the uplot bars chart out of the main chunk
function DeferredCatchingUpBars(props: CatchingUpBarsProps) {
  const [Bars, setBars] = useState(() => catchingUpBars);
  useEffect(() => {
    if (Bars) return;
    let cancelled = false;
    void import("./CatchingUpBars").then((m) => {
      catchingUpBars = m.CatchingUpBars;
      if (!cancelled) startTransition(() => setBars(() => m.CatchingUpBars));
    });
    return () => {
      cancelled = true;
    };
  }, [Bars]);
  // reserve the bars' final box while the chunk loads
  return Bars ? <Bars {...props} /> : <Box height="77px" />;
}

export default function CatchingUp() {
  const setContainerEl = useSetAtom(catchingUpContainerElAtom);
  const hasCatchingUpData = useAtomValue(hasCatchingUpDataAtom);
  const catchingUpRatesRef = useEstimateTotalSlots();

  const startSlot = useAtomValue(catchingUpStartSlotAtom);
  const latestTurbineSlot = useAtomValue(latestTurbineSlotAtom);
  const latestReplaySlot = useAtomValue(completedSlotAtom);

  const phaseCompleteFraction = useMemo(() => {
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
    return clamp(replayedSlots / totalSlotsToReplay, 0, 1);
  }, [latestReplaySlot, latestTurbineSlot, startSlot]);

  const overallCompleteFraction = useOverallCompleteFraction(
    phaseCompleteFraction,
  );

  return (
    <>
      <PhaseHeader
        phaseCompleteFraction={phaseCompleteFraction}
        overallCompleteFraction={overallCompleteFraction}
        remainingSeconds={catchingUpRatesRef.current.remainingSeconds}
        reserveRemaining
      />
      <Flex
        direction="column"
        mt="8px"
        gap="8px"
        className={bodyStyles.startupContentIndentation}
      >
        {hasCatchingUpData && (
          <Flex ref={setContainerEl} direction="column" gap="5px">
            <BarsLabels />
            <DeferredCatchingUpBars catchingUpRatesRef={catchingUpRatesRef} />
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
