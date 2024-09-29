import { Flex, Text } from "@radix-ui/themes";
import styles from "./incompleteStep.module.css";
import { CSSProperties } from "react";

interface IncompleteStepProps {
  label: string;
  hide?: boolean;
}
export default function IncompleteStep({ label, hide }: IncompleteStepProps) {
  const style: CSSProperties = hide ? { visibility: "hidden" } : {};

  return (
    <Flex gap="2" align="center" style={style} className={styles.container}>
      <Text className={styles.text}>{label}</Text>
    </Flex>
  );
}
