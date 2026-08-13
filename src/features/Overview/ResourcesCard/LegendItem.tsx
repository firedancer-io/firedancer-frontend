import { Flex, Text, Tooltip } from "@radix-ui/themes";
import clsx from "clsx";
import styles from "./resourcesCard.module.css";

interface LegendItemProps {
  label: string;
  value: string | number;
  /** Swatch fill. Omit for a value-only item (e.g. "Total"). */
  color?: string;
  /** Applied to the swatch instead of a solid `color` (e.g. hatched offline). */
  swatchClassName?: string;
  tooltip?: string;
}

/**
 * Compact `[swatch] label value` legend row, matching the Accounts compaction
 * card legend. Used across the CPU, memory, and disk sections.
 */
export default function LegendItem({
  label,
  value,
  color,
  swatchClassName,
  tooltip,
}: LegendItemProps) {
  const hasSwatch = color !== undefined || swatchClassName !== undefined;
  const item = (
    <Flex align="center" gap="1" className={styles.legendKeyItem}>
      {hasSwatch && (
        <span
          className={clsx(styles.legendKeySwatch, swatchClassName)}
          style={color !== undefined ? { background: color } : undefined}
        />
      )}
      <Text>{label}</Text>
      <Text className={styles.legendKeyValue}>{value}</Text>
    </Flex>
  );

  return tooltip ? <Tooltip content={tooltip}>{item}</Tooltip> : item;
}
