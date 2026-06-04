import { Flex, Text } from "@radix-ui/themes";
import styles from "./stat.module.css";
import type { CSSProperties } from "react";
import clsx from "clsx";

type Size = "sm" | "lg";

interface StatProps {
  className?: string;
  label?: string;
  value: string;
  size?: Size;
  color?: CSSProperties["color"];
  suffix?: string;
  suffixColor?: CSSProperties["color"];
}

export default function Stat({
  className,
  label,
  value,
  size = "sm",
  color,
  suffix,
}: StatProps) {
  return (
    <Flex className={className} direction="column">
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
