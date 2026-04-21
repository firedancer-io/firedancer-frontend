import { Flex, Text } from "@radix-ui/themes";
import styles from "./cardStat.module.css";
import { useMemo, type CSSProperties } from "react";
import clsx from "clsx";
import AnimatedInteger from "./AnimatedInteger";

interface CardStatProps {
  label: string;
  value: string | number;
  valueColor?: string;
  valueSize: "small" | "medium" | "large";
  animateInteger?: boolean;
  appendValue?: string;
  appendValueColor?: string;
  className?: string;
}
export default function CardStat({
  label,
  value,
  valueColor,
  valueSize,
  animateInteger = false,
  appendValue,
  appendValueColor,
  className,
}: CardStatProps) {
  const valueClassName = useMemo(() => {
    return clsx(styles.value, {
      [styles.small]: valueSize === "small",
      [styles.medium]: valueSize === "medium",
      [styles.large]: valueSize === "large",
    });
  }, [valueSize]);

  return (
    <Flex
      direction="column"
      align="start"
      className={clsx(styles.container, className)}
      style={{ "--value-color": valueColor } as CSSProperties}
    >
      <Text className={styles.label}>{label}</Text>
      <Flex align="baseline" gap="1">
        {typeof value === "number" && animateInteger ? (
          <AnimatedInteger value={value} className={valueClassName} />
        ) : (
          <Text className={valueClassName}>{value}</Text>
        )}

        {appendValue && (
          <Text
            className={styles.appendValue}
            style={
              { "--append-value-color": appendValueColor } as CSSProperties
            }
          >
            {appendValue}
          </Text>
        )}
      </Flex>
    </Flex>
  );
}
