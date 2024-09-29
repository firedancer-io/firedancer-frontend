import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import { PropsWithChildren } from "react";

interface StatCardProps {
  headerText: string;
  primaryText: string;
  primaryTextColor: string;
}

export default function StatCard({
  headerText,
  primaryText,
  primaryTextColor,
  children,
}: PropsWithChildren<StatCardProps>) {
  return (
    <Card>
      <Flex direction="column" gap="1">
        <Text size="4" style={{ color: "#B2BCC9" }} weight="medium">
          {headerText}
        </Text>
        <Text size="7" style={{ color: primaryTextColor }}>
          {primaryText}
        </Text>
        {children}
      </Flex>
    </Card>
  );
}
