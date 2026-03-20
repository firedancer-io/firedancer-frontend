import { Flex, Text } from "@radix-ui/themes";
import styles from "./cardStat.module.css";
import { useMemo, type CSSProperties, type PropsWithChildren } from "react";
import clsx from "clsx";
import { isNumber } from "lodash";
import AnimatedInteger from "./AnimatedInteger";

interface CardStatProps {
  label: string;
  value: string | number;
  valueColor: string;
  appendValue?: string;
  valueSize?: "small" | "medium" | "large";
  style?: CSSProperties;
  animateInteger?: boolean;
}
export default function CardStat({
  label,
  value,
  valueColor,
  appendValue,
  valueSize = "small",
  style,
  animateInteger = false,
  children,
}: PropsWithChildren<CardStatProps>) {
  const textStyles = useMemo(() => {
    return {
      className: clsx(styles.value, {
        [styles.small]: valueSize === "small",
        [styles.medium]: valueSize === "medium",
        [styles.large]: valueSize === "large",
      }),
    };
  }, [valueSize]);

  return (
    <Flex
      direction="column"
      align="start"
      style={{ ...style, "--value-color": valueColor } as CSSProperties}
    >
      <Text className={styles.label}>{label}</Text>
      <Flex align="baseline" gap="1">
        {isNumber(value) && animateInteger ? (
          <AnimatedInteger value={value} textStyles={textStyles} />
        ) : (
          <Text className={textStyles.className}>{value}</Text>
        )}

        {appendValue && (
          <Text className={styles.appendValue}>{appendValue}</Text>
        )}
        {children}
      </Flex>
    </Flex>
  );
}
