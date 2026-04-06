import bodyStyles from "../body.module.css";
import { Flex } from "@radix-ui/themes";
import PhaseHeader from "../PhaseHeader";
import { useOverallCompleteFraction } from "../useOverallCompleteFraction";
import SupermajorityTable from "./SupermajorityTable";
import SupermajorityPieChart from "./SupermajorityPieChart";
import SupermajorityDetailsCard from "./SupermajorityDetailsCard";
import { useAtomValue } from "jotai";
import { clamp } from "lodash";
import { bootProgressAtom } from "../../../../api/atoms";
import { useMedia } from "react-use";

export default function Supermajority() {
  const isStacked = useMedia("(max-width: 1025px)");
  // for supermajority phase, always show just the sum of the completed phases as a pct
  const overallCompleteFraction = useOverallCompleteFraction(0);
  const bootProgress = useAtomValue(bootProgressAtom);

  if (!bootProgress) return null;

  const connectedStake = bootProgress.wait_for_supermajority_connected_stake;
  const totalStake = bootProgress.wait_for_supermajority_total_stake;

  const stakeFraction =
    totalStake && connectedStake
      ? clamp(Number(connectedStake) / Number(totalStake), 0, 1)
      : 0;

  // phase completes at 80% stake
  const phaseCompletionFraction = stakeFraction / 0.8;

  const gap = isStacked ? "24px" : "67px";

  return (
    <>
      <PhaseHeader
        phaseCompleteFraction={phaseCompletionFraction}
        overallCompleteFraction={overallCompleteFraction}
        showLoadingIcon
      />
      <Flex
        flexGrow="1"
        mt="36px"
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
          flexGrow="1"
          flexShrink="1"
          gap={gap}
        >
          <SupermajorityPieChart stakeFraction={stakeFraction} />
          <SupermajorityDetailsCard />
        </Flex>
      </Flex>
    </>
  );
}
