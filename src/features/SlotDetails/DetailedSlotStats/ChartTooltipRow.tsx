import { Text } from "@radix-ui/themes";
import styles from "./detailedSlotStats.module.css";

interface ChartTooltipRowProps {
  label: string;
  value: string;
  color?: string;
}

export function ChartTooltipRow({ label, value, color }: ChartTooltipRowProps) {
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
        {value}
      </Text>
    </>
  );
}
