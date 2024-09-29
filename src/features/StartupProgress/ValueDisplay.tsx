import styles from "./valueDisplay.module.css";
import { Flex, Text } from "@radix-ui/themes";

interface ValueDisplayProps {
  label: string;
  value: string | number | null;
}

export default function ValueDisplay({ label, value }: ValueDisplayProps) {
  return (
    <Flex gap="1" flexGrow="1">
      <Text className={styles.label}>{label}</Text>
      <Text className={styles.value}>{value ?? "-"}</Text>
    </Flex>
  );
}
