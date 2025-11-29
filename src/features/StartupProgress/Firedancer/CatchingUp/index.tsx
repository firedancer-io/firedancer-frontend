import { Box, Card, Flex, Text } from "@radix-ui/themes";
import { CatchingUpBars } from "./CatchingUpBars";
import { BarsFooter } from "./BarsFooter";
import BarsLabels from "./BarsLabels";
import { useAtomValue, useSetAtom } from "jotai";
import { catchingUpContainerElAtom, hasCatchingUpDataAtom } from "./atoms";
import ShredsChart from "../../../Overview/ShredsProgression/ShredsChart";
import styles from "./catchingUp.module.css";
import CatchingUpTiles from "./CatchingUpTiles";
import { PhaseHeader } from "../PhaseHeader";
import useEstimateTotalSlots from "./useCatchingUpRates";
import { BarsStats } from "./BarsStats";
import { ShredsChartLegend } from "../../../Overview/ShredsProgression/ShredsChartLegend";

export default function CatchingUp() {
  const setContainerEl = useSetAtom(catchingUpContainerElAtom);
  const hasCatchingUpData = useAtomValue(hasCatchingUpDataAtom);
  const catchingUpRatesRef = useEstimateTotalSlots();

  return (
    <>
      <PhaseHeader phase="catching_up" />
      <Flex direction="column" height="100%" mt="8px" gap="8px">
        {hasCatchingUpData && (
          <Flex ref={setContainerEl} direction="column" gap="5px">
            <BarsLabels />
            <CatchingUpBars catchingUpRatesRef={catchingUpRatesRef} />
            <BarsFooter />
            <BarsStats catchingUpRatesRef={catchingUpRatesRef} />
          </Flex>
        )}

        <Card className={styles.card} mb="14px">
          <Flex gap="15px" align="center" wrap="wrap">
            <Text className={styles.title}>Shreds</Text>
            <ShredsChartLegend />
          </Flex>
          <Box flexGrow="1" minHeight="280px">
            <ShredsChart chartId="catching-up-shreds" isOnStartupScreen />
          </Box>
        </Card>

        <CatchingUpTiles />
      </Flex>
    </>
  );
}
