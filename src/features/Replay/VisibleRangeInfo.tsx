import { Flex } from "@radix-ui/themes";
import { DateTime } from "luxon";
import { memo, useLayoutEffect, useState } from "react";
import type { RangeChangeSubscriberProps } from "./const";
import type { NsTsRange } from "../WebGl/webglUtils";
import { getDateTimeFromNanos } from "../../utils";

const formatAbsoluteTs = (absoluteNs: bigint) =>
  getDateTimeFromNanos(absoluteNs).toLocaleString(
    DateTime.DATETIME_MED_WITH_SECONDS,
  );

const DURATION_UNITS: [label: string, ns: bigint][] = [
  ["hr", 3_600_000_000_000n],
  ["min", 60_000_000_000n],
  ["sec", 1_000_000_000n],
  ["ms", 1_000_000n],
  ["µs", 1_000n],
  ["ns", 1n],
];

const formatWindowDuration = (durationNs: bigint, maxSignificantUnits = 2) => {
  let remaining = durationNs < 0n ? -durationNs : durationNs;
  const parts: string[] = [];
  for (const [unitLabel, unitNs] of DURATION_UNITS) {
    const value = remaining / unitNs;
    if (value > 0n) parts.push(`${value} ${unitLabel}`);
    remaining %= unitNs;
  }
  if (parts.length === 0) return "0 ns";
  return parts.slice(0, maxSignificantUnits).join(", ");
};

const subscriberId = "visible-range";
export default memo(function VisibleRangeInfo({
  subscribeRangeChange,
  getAbsoluteNs,
}: RangeChangeSubscriberProps) {
  const [absoluteVisibleRangeNs, setAbsoluteVisibleRangeNs] =
    useState<NsTsRange>();

  useLayoutEffect(() => {
    const unsubscribe = subscribeRangeChange(subscriberId, (visibleRangeMs) => {
      setAbsoluteVisibleRangeNs([
        getAbsoluteNs(visibleRangeMs[0]),
        getAbsoluteNs(visibleRangeMs[1]),
      ]);
    });
    return () => unsubscribe?.();
  }, [subscribeRangeChange, getAbsoluteNs]);

  if (!absoluteVisibleRangeNs) return null;

  const durationNs = absoluteVisibleRangeNs[1] - absoluteVisibleRangeNs[0];
  const durationText = formatWindowDuration(durationNs);

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
