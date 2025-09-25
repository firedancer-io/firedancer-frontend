import { Text } from "@radix-ui/themes";
import PctBar from "./PctBar";

interface PctBarRowProps {
  label: string;
  value: number;
  total: number;
  valueColor: string;
}

export default function PctBarRow({
  label,
  value,
  total,
  valueColor,
}: PctBarRowProps) {
  const pct = Math.round(total ? (value / total) * 100 : 0);

  return (
    <>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }}>
        {label}
      </Text>
      <Text wrap="nowrap" style={{ color: valueColor }} align="right">
        {value.toLocaleString()}
      </Text>
      <Text wrap="nowrap" style={{ color: "var(--gray-10)" }}>
        /
      </Text>
      <Text wrap="nowrap" style={{ color: "var(--gray-10)" }} align="right">
        {total.toLocaleString()}
      </Text>
      <Text wrap="nowrap" style={{ color: "var(--gray-10)" }} align="right">
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
