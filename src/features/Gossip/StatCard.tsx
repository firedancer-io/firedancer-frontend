import { Card, Flex, Text } from "@radix-ui/themes";

interface StatCardProps {
  label: string;
  value: number | string;
  valueColor?: string;
  size?: "sm";
}

export function StatCard(props: StatCardProps) {
  return (
    <Card>
      <StatCardContent {...props} />
    </Card>
  );
}

export function StatCardContent({
  value,
  label,
  valueColor,
  size,
}: StatCardProps) {
  const formattedValue =
    typeof value === "string" ? value : value.toLocaleString();
  return (
    <Flex direction="column">
      <Text size="5" style={{ color: "var(--gray-10)" }}>
        {label}
      </Text>
      <Text
        size={size === "sm" ? '7' : '8'}
        style={{ color: valueColor ?? "var(--gray-11)" }}
      >
        {formattedValue}
      </Text>
    </Flex>
  );
}
