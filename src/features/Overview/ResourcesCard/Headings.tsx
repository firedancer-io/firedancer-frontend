import type { ReactNode } from "react";
import { Flex, Text } from "@radix-ui/themes";
import styles from "./headings.module.css";

interface SectionHeadingProps {
  label: string;
  value?: string;
}

export function SectionHeading({ label, value }: SectionHeadingProps) {
  return (
    <Flex
      className={styles.sectionHeading}
      align="baseline"
      justify="between"
      gap="12px"
      pb="6px"
    >
      <Text className={styles.sectionLabel}>{label}</Text>
      {value != null && <Text className={styles.sectionValue}>{value}</Text>}
    </Flex>
  );
}

interface SubHeadingProps {
  label: string;
  value?: string;
  children?: ReactNode;
}

export function SubHeading({ label, value, children }: SubHeadingProps) {
  return (
    <Flex align="baseline" justify="between" gap="12px" minWidth="0">
      <Flex align="center" gapX="10px" gapY="2px" wrap="wrap" minWidth="0">
        <Text className={styles.subheadingLabel}>{label}</Text>
        {children}
      </Flex>
      {value != null && <Text className={styles.sectionValue}>{value}</Text>}
    </Flex>
  );
}
