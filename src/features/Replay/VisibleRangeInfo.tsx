import { Flex } from "@radix-ui/themes";
import { DateTime } from "luxon";
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

const DURATION_UNITS: [label: string, ns: bigint][] = [
  ["h", 3_600_000_000_000n],
  ["m", 60_000_000_000n],
  ["s", 1_000_000_000n],
  ["ms", 1_000_000n],
  ["µs", 1_000n],
  ["ns", 1n],
];

const formatWindowDuration = (durationNs: bigint, maxSignificantUnits = 2) => {
  let remaining = durationNs < 0n ? -durationNs : durationNs;
  const parts: string[] = [];
  for (const [label, unitNs] of DURATION_UNITS) {
    const count = remaining / unitNs;
    if (count > 0n) parts.push(`${count} ${label}`);
    remaining %= unitNs;
  }
  if (parts.length === 0) return "0 ns";
  return parts.slice(0, maxSignificantUnits).join(", ");
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
    const durationNs =
      calcAbsoluteNs(referenceNs, end) - calcAbsoluteNs(referenceNs, start);
    return formatWindowDuration(durationNs);
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
