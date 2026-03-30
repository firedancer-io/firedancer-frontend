import bodyStyles from "../body.module.css";
import { Flex } from "@radix-ui/themes";
import PhaseHeader from "../PhaseHeader";
import { useOverallCompleteFraction } from "../useOverallCompleteFraction";
import SupermajorityPieChart from "./SupermajorityPieChart";
import SupermajorityDetailsCard from "./SupermajorityDetailsCard";
import { useAtomValue } from "jotai";
import { clamp } from "lodash";
import { bootProgressAtom } from "../../../../api/atoms";

export default function Supermajority() {
  // pin to sum of previous phases
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

  return (
    <>
      <PhaseHeader
        phaseCompleteFraction={phaseCompletionFraction}
        overallCompleteFraction={overallCompleteFraction}
        showLoadingIcon
      />
      <Flex
        mt="36px"
        direction="column"
        align="center"
        justify="center"
        gapY="67px"
        className={bodyStyles.startupContentIndentation}
      >
        <SupermajorityPieChart stakeFraction={stakeFraction} />
        <SupermajorityDetailsCard />
      </Flex>
    </>
  );
}
