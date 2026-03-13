import { Text } from "@radix-ui/themes";
import styles from "./detailedSlotStats.module.css";

interface ChartTooltipRowProps {
  label: string;
  value: number;
  color?: string;
  formatter?: (x: number) => string;
}

export function ChartTooltipRow({
  label,
  value,
  color,
  formatter,
}: ChartTooltipRowProps) {
  return (
    <>
      <Text wrap="nowrap" className={styles.label}>
        {label}
      </Text>
      <Text
        wrap="nowrap"
        className={styles.value}
        align="right"
        style={{ color }}
      >
        {formatter ? formatter(value) : value.toLocaleString()}
      </Text>
    </>
  );
}
