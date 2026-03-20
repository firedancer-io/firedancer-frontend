import { Flex, Text } from "@radix-ui/themes";
import styles from "./cardStat.module.css";
import type { CSSProperties, PropsWithChildren } from "react";
import clsx from "clsx";

interface CardStatProps {
  label: string;
  value: string;
  valueColor: string;
  appendValue?: string;
  valueSize?: "small" | "medium" | "large";
  style?: CSSProperties;
}

export default function CardStat({
  label,
  value,
  valueColor,
  appendValue,
  valueSize = "small",
  style,
  children,
}: PropsWithChildren<CardStatProps>) {
  return (
    <Flex direction="column" align="start" style={{ ...style }}>
      <Text className={styles.label}>{label}</Text>
      <Flex align="baseline" gap="1">
        <Text
          className={clsx(styles.value, {
            [styles.small]: valueSize === "small",
            [styles.medium]: valueSize === "medium",
            [styles.large]: valueSize === "large",
          })}
          style={{ color: valueColor }}
        >
          {value}
        </Text>
        {appendValue && (
          <Text className={styles.appendValue}>{appendValue}</Text>
        )}
        {children}
      </Flex>
    </Flex>
  );
}
