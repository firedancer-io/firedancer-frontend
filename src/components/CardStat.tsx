import { Flex, Text } from "@radix-ui/themes";
import styles from "./cardStat.module.css";
import { CSSProperties, PropsWithChildren } from "react";

interface CardStatProps {
  label: string;
  value: string;
  valueColor: string;
  appendValue?: string;
  large?: boolean;
  style?: CSSProperties;
  valueStyle?: CSSProperties;
}

export default function CardStat({
  label,
  value,
  valueColor,
  appendValue,
  large,
  style,
  valueStyle,
  children,
}: PropsWithChildren<CardStatProps>) {
  const valueStyles =
    valueStyle ??
    (large
      ? ({ fontSize: "28px", letterSpacing: "-1.12px" } as const)
      : { fontSize: "18px", fontWeight: 500 });

  return (
    <Flex direction="column" align="start" style={{ ...style }}>
      <Text className={styles.label}>{label}</Text>
      <Flex align="baseline" gap="1">
        <Text
          className={styles.value}
          style={{ color: valueColor, ...valueStyles }}
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
