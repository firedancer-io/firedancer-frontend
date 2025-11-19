import { Card, Flex, Text } from "@radix-ui/themes";
import styles from "./statCard.module.css";

interface StatCardProps {
  label: string;
  value: number | string;
  valueColor?: string;
}

export function StatCard(props: StatCardProps) {
  return (
    <Card>
      <StatCardContent {...props} />
    </Card>
  );
}

export function StatCardContent({ value, label, valueColor }: StatCardProps) {
  const formattedValue =
    typeof value === "string" ? value : value.toLocaleString();
  return (
    <Flex direction="column" minWidth="0" gap="10px">
      <Text className={styles.label}>{label}</Text>
      <Text
        className={styles.value}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {formattedValue}
      </Text>
    </Flex>
  );
}
