import styles from "./supermajority.module.css";
import { Box, Flex, Text } from "@radix-ui/themes";
import PhaseHeader from "../PhaseHeader";
import SupermajorityTable from "./SupermajorityTable";
import SupermajorityPieChart from "./SupermajorityPieChart";
import SupermajorityDetailsBox from "./SupermajorityDetailsBox";
import { useAtomValue } from "jotai";
import { bootProgressAtom } from "../../../../api/atoms";
import { useMedia } from "react-use";
import { bootProgressPhaseDetailsAtom } from "../../atoms";

const pieChartMaxHeight = "400px";
const smallGap = "24px";
const bigGap = "50px";

export default function Supermajority() {
  const isStacked = useMedia("(max-width: 1025px)");
  const bootProgress = useAtomValue(bootProgressAtom);
  const phaseFraction = useAtomValue(
    bootProgressPhaseDetailsAtom,
  )?.completionFraction;

  if (!bootProgress || !phaseFraction) return null;

  // for supermajority phase, pin the complete pct to 99%
  const phaseCompleteFraction = 1 - 0.01 / phaseFraction;
  const overallCompleteFraction = 0.99;

  return (
    <>
      <PhaseHeader
        phaseCompleteFraction={phaseCompleteFraction}
        overallCompleteFraction={overallCompleteFraction}
        showLoadingIcon
      />
      <Flex
        flexGrow="1"
        mt={isStacked ? "18px" : "36px"}
        direction={isStacked ? "column-reverse" : "row"}
        justify={isStacked ? "end" : "center"}
        align="stretch"
        gap={isStacked ? smallGap : bigGap}
        minHeight="0"
      >
        <SupermajorityTable isStacked={isStacked} />
        <Flex
          direction="column"
          align="center"
          width={isStacked ? "100%" : undefined}
          minWidth="300px"
          maxWidth={isStacked ? undefined : pieChartMaxHeight}
          flexBasis="30%"
          flexGrow={isStacked ? "0" : "1"}
          flexShrink="1"
        >
          <Text className={styles.pieChartTitle}>Stake Online</Text>
          <Flex
            className={styles.pieChartContainer}
            mt={isStacked ? "4px" : "8px"}
            maxHeight={pieChartMaxHeight}
            justify="center"
          >
            <SupermajorityPieChart />
          </Flex>
          <Box
            height={isStacked ? smallGap : undefined}
            minHeight={smallGap}
            maxHeight={bigGap}
            flexGrow="1"
          />
          <SupermajorityDetailsBox />
        </Flex>
      </Flex>
    </>
  );
}
