import { Flex } from "@radix-ui/themes";
import { Duration, DateTime } from "luxon";
import { memo, useMemo } from "react";
import { nsPerMs } from "../../consts";
import { useAtomValue } from "jotai";
import { referenceNsAtom, visibleRangeAtom } from "./atoms";
import { calcAbsoluteNs } from "./utils";

const formatAbsoluteTs = (absoluteNs: bigint) => {
  return DateTime.fromMillis(
    Number(absoluteNs / BigInt(nsPerMs)),
  ).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
};

export default memo(function VisibleRangeInfo() {
  const visibleRange = useAtomValue(visibleRangeAtom);
  const referenceNs = useAtomValue(referenceNsAtom);

  const start = visibleRange?.[0];
  const startText = useMemo(() => {
    if (referenceNs == null || start == null) return;
    const abs = calcAbsoluteNs(referenceNs, start);
    return formatAbsoluteTs(abs);
  }, [referenceNs, start]);

  const end = visibleRange?.[1];
  const endText = useMemo(() => {
    if (referenceNs == null || end == null) return;
    const abs = calcAbsoluteNs(referenceNs, end);
    return formatAbsoluteTs(abs);
  }, [referenceNs, end]);

  const durationText = useMemo(() => {
    if (start == null || end == null || referenceNs == null) return;
    const durationMs = end - start;

    return Duration.fromMillis(durationMs)
      .shiftTo("days", "hours", "minutes", "seconds", "milliseconds")
      .normalize()
      .toHuman({ unitDisplay: "short", maximumFractionDigits: 0 })
      .split(", ")
      .filter((part) => !part.startsWith("0 "))
      .join(", ");
  }, [end, referenceNs, start]);

  return (
    <Flex justify="between" my="2">
      <Value>{startText}</Value>
      <div>
        Window duration: <Value>{durationText}</Value>
      </div>
      <Value>{endText}</Value>
    </Flex>
  );
});

function Value({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#b0b0b0" }}>{children}</span>;
}
