import { Flex, Text } from "@radix-ui/themes";
import styles from "./stat.module.css";
import type { CSSProperties } from "react";
import clsx from "clsx";
import type { ValueWithUnit } from "../../utils";

type Size = "sm" | "lg";

interface StatProps {
  className?: string;
  label?: string;
  value: string;
  size?: Size;
  color?: CSSProperties["color"];
  suffix?: string;
  minWidth?: string;
}

export default function Stat({
  className,
  label,
  value,
  size = "sm",
  color,
  suffix,
  minWidth,
}: StatProps) {
  return (
    <Flex className={className} direction="column" minWidth={minWidth}>
      {label && <Text className={styles.label}>{label}</Text>}
      <Flex
        className={clsx(styles.valuesContainer, { [styles.lg]: size === "lg" })}
        align="baseline"
      >
        <Text className={styles.value} style={color ? { color } : undefined}>
          {value}
        </Text>
        {suffix && <Text className={styles.suffix}>{suffix}</Text>}
      </Flex>
    </Flex>
  );
}
interface FractionStatProps {
  className?: string;
  label?: string;
  numerator: ValueWithUnit;
  denominator: ValueWithUnit;
  color?: CSSProperties["color"];
  minWidth?: string;
}

export function FractionStat({
  className,
  label,
  numerator,
  denominator,
  color,
  minWidth,
}: FractionStatProps) {
  return (
    <Flex className={className} direction="column" minWidth={minWidth}>
      {label && <Text className={styles.label}>{label}</Text>}
      <Flex className={styles.valuesContainer} align="baseline">
        <Text className={styles.value} style={color ? { color } : undefined}>
          {numerator.value}
        </Text>
        {numerator.unit !== denominator.unit && (
          <Text className={styles.suffix}>{numerator.unit}</Text>
        )}
        <Text className={styles.secondaryValue}>/</Text>
        <Text className={styles.secondaryValue}>{denominator.value}</Text>
        <Text className={styles.suffix}>{denominator.unit}</Text>
      </Flex>
    </Flex>
  );
}
