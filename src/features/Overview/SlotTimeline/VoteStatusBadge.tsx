import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { voteDistanceAtom, voteStateAtom } from "../../../api/atoms";
import {
  failureColor,
  mySlotsColor,
  regularTextColor,
  successColor,
  voteDistanceColor,
} from "../../../colors";

/** Compact vote-status indicator shown in the timeline header. */
export default function VoteStatusBadge() {
  const voteState = useAtomValue(voteStateAtom);
  const voteDistance = useAtomValue(voteDistanceAtom);

  const voteColor = useMemo(() => {
    if (voteState === "voting") {
      return successColor;
    } else if (voteState === "non-voting") {
      return mySlotsColor;
    } else if (voteState === "delinquent") {
      return failureColor;
    }
    return regularTextColor;
  }, [voteState]);

  const voteDistanceText = useMemo(() => {
    if (voteDistance == null) return undefined;
    if (voteState === "delinquent") return undefined;

    const value = voteDistance > 150 ? "> 150" : voteDistance;
    return `${value} behind`;
  }, [voteDistance, voteState]);

  return (
    <Flex align="baseline" gap="2" wrap="nowrap">
      <Text style={{ color: regularTextColor, fontSize: "13px" }}>
        Vote Status
      </Text>
      <Text weight="medium" style={{ color: voteColor }}>
        {voteState ?? "Unknown"}
      </Text>
      {voteDistanceText && (
        <Text style={{ color: voteDistanceColor, fontSize: "13px" }}>
          {voteDistanceText}
        </Text>
      )}
    </Flex>
  );
}
