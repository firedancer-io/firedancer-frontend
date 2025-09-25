import { Grid, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { useSlotQueryPublish } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { estimatedSlotDurationAtom } from "../../../../api/atoms";
import { formatNumber } from "../../../../numUtils";

export default function Duration() {
  const _duration = useAtomValue(estimatedSlotDurationAtom) ?? 0;
  const [duration] = useState(_duration);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryPublish(selectedSlot);
  const slotDuration = query?.publish?.duration_nanos;
  if (slotDuration == null) return;

  const max = Math.max(400_000_000, duration, slotDuration);
  return (
    <>
      <Text style={{ color: "var(--gray-12)" }}>Duration (ms)</Text>
      <Grid columns="repeat(2, auto) minmax(60px, 150px)" gapX="3" gapY="1">
        <Row
          label="Actual"
          value={slotDuration}
          color="var(--jade-9)"
          max={max}
        />
        <Row
          label="Average"
          value={duration}
          color="var(--purple-9)"
          max={max}
        />
      </Grid>
    </>
  );
}

interface RowProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

function Row({ label, value, max, color }: RowProps) {
  const pct = (value / max) * 100;

  return (
    <>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }}>
        {label}
      </Text>
      <Text wrap="nowrap" style={{ color }} align="right">
        {formatNumber(value / 1_000_000, { decimals: 3 })}
      </Text>
      <svg
        height="8"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center", width: "100%" }}
      >
        <rect height="8" width={`${pct}%`} opacity={0.6} fill={color} />
      </svg>
    </>
  );
}
