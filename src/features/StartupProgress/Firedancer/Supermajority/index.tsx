import bodyStyles from "../body.module.css";
import { Flex } from "@radix-ui/themes";
import PhaseHeader from "../PhaseHeader";
import SupermajorityTable from "./SupermajorityTable";
import SupermajorityPieChart from "./SupermajorityPieChart";
import SupermajorityDetailsCard from "./SupermajorityDetailsCard";
import { useAtomValue } from "jotai";
import { bootProgressAtom } from "../../../../api/atoms";
import { useMedia } from "react-use";
import { bootProgressPhaseDetailsAtom } from "../../atoms";

export default function Supermajority() {
  const isStacked = useMedia("(max-width: 1025px)");
  const bootProgress = useAtomValue(bootProgressAtom);
  const phaseFraction = useAtomValue(
    bootProgressPhaseDetailsAtom,
  )?.completionFraction;

  if (!bootProgress || phaseFraction == null) return null;

  // for supermajority phase, pin the complete pct to 99%
  const phaseCompleteFraction = 1 - 0.01 / phaseFraction;
  const overallCompleteFraction = 0.99;

  const gap = isStacked ? "24px" : "67px";

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
        align="stretch"
        justify="center"
        gap={gap}
        minHeight="600px"
        className={bodyStyles.startupContentIndentation}
      >
        <SupermajorityTable isStacked={isStacked} />
        <Flex
          direction="column"
          align="center"
          width={isStacked ? "100%" : undefined}
          minWidth="300px"
          flexBasis="40%"
          flexGrow={isStacked ? "0" : "1"}
          flexShrink="1"
          gap={gap}
        >
          <SupermajorityPieChart />
          <SupermajorityDetailsCard />
        </Flex>
      </Flex>
    </>
  );
}
