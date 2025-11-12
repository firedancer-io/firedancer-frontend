import { Text } from "@radix-ui/themes";
import PctBar from "./PctBar";
import {
  slotDetailsStatsPrimary,
  slotDetailsStatsSecondary,
} from "../../../colors";

interface PctBarRowProps {
  label: string;
  value: number;
  total: number;
  valueColor: string;
  numeratorColor?: boolean;
}

export default function PctBarRow({
  label,
  value,
  total,
  valueColor,
  numeratorColor = true,
}: PctBarRowProps) {
  const pct = Math.round(total ? (value / total) * 100 : 0);

  return (
    <>
      <Text wrap="nowrap" style={{ color: slotDetailsStatsSecondary }}>
        {label}
      </Text>
      <Text
        wrap="nowrap"
        style={{ color: numeratorColor ? valueColor : slotDetailsStatsPrimary }}
        align="right"
      >
        {value.toLocaleString()}
      </Text>
      <Text wrap="nowrap" style={{ color: slotDetailsStatsPrimary }}>
        /
      </Text>
      <Text
        wrap="nowrap"
        style={{ color: slotDetailsStatsPrimary }}
        align="right"
      >
        {total.toLocaleString()}
      </Text>
      <Text
        wrap="nowrap"
        style={{ color: slotDetailsStatsPrimary }}
        align="right"
      >
        {pct}%
      </Text>

      <PctBar
        value={value}
        total={total}
        valueColor={valueColor}
        showBackground
      />
    </>
  );
}
