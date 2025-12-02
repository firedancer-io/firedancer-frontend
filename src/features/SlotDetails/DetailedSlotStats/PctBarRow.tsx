import { Text, Tooltip } from "@radix-ui/themes";
import PctBar from "./PctBar";
import styles from "./detailedSlotStats.module.css";
import { useMemo } from "react";

interface PctBarRowProps {
  label: string;
  value: number;
  total: number;
  valueColor: string;
  labelWidth?: string;
  numeratorColor?: boolean;
  pctColor?: boolean;
}

export default function PctBarRow({
  label,
  value,
  total,
  valueColor,
  labelWidth,
  numeratorColor = true,
  pctColor = false,
}: PctBarRowProps) {
  const pct = Math.round(total ? (value / total) * 100 : 0);
  const labelEl = useMemo(
    () => (
      <Text className={styles.label} truncate style={{ width: labelWidth }}>
        {label}
      </Text>
    ),
    [label, labelWidth],
  );

  return (
    <>
      {labelWidth ? <Tooltip content={label}>{labelEl}</Tooltip> : labelEl}
      <Text
        className={styles.value}
        style={{ color: numeratorColor ? valueColor : undefined }}
        align="right"
      >
        {value.toLocaleString()}
      </Text>
      <Text className={styles.value}>/</Text>
      <Text className={styles.value} align="right">
        {total.toLocaleString()}
      </Text>
      <Text
        className={styles.value}
        style={{ color: pctColor ? valueColor : undefined }}
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
