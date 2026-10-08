import { Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import styles from "./resourcesCard.module.css";

interface SectionHeadingProps {
  label: string;
  /** Right-aligned secondary text (e.g. a total or summary). */
  value?: ReactNode;
}

/**
 * `label` on the left, muted `value` on the right — the shared header used by the
 * CPU, Memory, and Disk sections.
 */
export default function SectionHeading({ label, value }: SectionHeadingProps) {
  return (
    <div className={styles.sectionHeading}>
      <Text className={styles.sectionLabel}>{label}</Text>
      {value != null && <Text className={styles.sectionValue}>{value}</Text>}
    </div>
  );
}
