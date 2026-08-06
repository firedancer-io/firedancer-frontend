import { Flex } from "@radix-ui/themes";
import { Duration } from "luxon";
import { memo, useLayoutEffect, useState } from "react";
import type { RangeChangeSubscriberProps, TsRange } from "./const";
import { formatAbsoluteTs } from "./utils";

const subscriberId = "visible-range";
export default memo(function VisibleRangeInfo({
  subscribeRangeChange,
  unsubscribeRangeChange,
  getAbsoluteMs,
}: RangeChangeSubscriberProps) {
  const [absoluteVisibleRangeMs, setAbsoluteVisibleRangeMs] =
    useState<TsRange>();

  useLayoutEffect(() => {
    subscribeRangeChange(subscriberId, (visibleRangeMs) => {
      setAbsoluteVisibleRangeMs(visibleRangeMs.map(getAbsoluteMs) as TsRange);
    });
    return () => unsubscribeRangeChange(subscriberId);
  }, [subscribeRangeChange, unsubscribeRangeChange, getAbsoluteMs]);

  if (!absoluteVisibleRangeMs) return null;

  const durationMs = absoluteVisibleRangeMs[1] - absoluteVisibleRangeMs[0];

  const durationText = Duration.fromMillis(durationMs)
    .shiftTo("days", "hours", "minutes", "seconds", "milliseconds")
    .normalize()
    .toHuman({ unitDisplay: "short", maximumFractionDigits: 0 })
    .split(", ")
    .filter((part) => !part.startsWith("0 "))
    .join(", ");

  return (
    <Flex justify="between" my="2">
      <Value>{formatAbsoluteTs(absoluteVisibleRangeMs[0])}</Value>
      <div>
        Window duration: <Value>{durationText}</Value>
      </div>
      <Value>{formatAbsoluteTs(absoluteVisibleRangeMs[1])}</Value>
    </Flex>
  );
});

function Value({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#b0b0b0" }}>{children}</span>;
}
