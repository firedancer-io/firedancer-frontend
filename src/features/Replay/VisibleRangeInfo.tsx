import { Flex } from "@radix-ui/themes";
import { Duration, DateTime } from "luxon";
import { memo, useLayoutEffect, useState } from "react";
import type { RangeChangeSubscriberProps } from "./const";
import type { NsTsRange } from "../WebGl/webglUtils";
import { nsPerMs } from "../../consts";

const formatAbsoluteTs = (absoluteNs: bigint) => {
  return DateTime.fromMillis(
    Number(absoluteNs / BigInt(nsPerMs)),
  ).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
};

const subscriberId = "visible-range";
export default memo(function VisibleRangeInfo({
  subscribeRangeChange,
  unsubscribeRangeChange,
  getAbsoluteNs,
}: RangeChangeSubscriberProps) {
  const [absoluteVisibleRangeNs, setAbsoluteVisibleRangeNs] =
    useState<NsTsRange>();

  useLayoutEffect(() => {
    subscribeRangeChange(subscriberId, (visibleRangeMs) => {
      setAbsoluteVisibleRangeNs([
        getAbsoluteNs(visibleRangeMs[0]),
        getAbsoluteNs(visibleRangeMs[1]),
      ]);
    });
    return () => unsubscribeRangeChange(subscriberId);
  }, [subscribeRangeChange, unsubscribeRangeChange, getAbsoluteNs]);

  if (!absoluteVisibleRangeNs) return null;

  const durationNs = absoluteVisibleRangeNs[1] - absoluteVisibleRangeNs[0];
  const durationMs = Number(durationNs / BigInt(nsPerMs));

  const durationText = Duration.fromMillis(durationMs)
    .shiftTo("days", "hours", "minutes", "seconds", "milliseconds")
    .normalize()
    .toHuman({ unitDisplay: "short", maximumFractionDigits: 0 })
    .split(", ")
    .filter((part) => !part.startsWith("0 "))
    .join(", ");

  return (
    <Flex justify="between" my="2">
      <Value>{formatAbsoluteTs(absoluteVisibleRangeNs[0])}</Value>
      <div>
        Window duration: <Value>{durationText}</Value>
      </div>
      <Value>{formatAbsoluteTs(absoluteVisibleRangeNs[1])}</Value>
    </Flex>
  );
});

function Value({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#b0b0b0" }}>{children}</span>;
}
