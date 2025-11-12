import { Flex, Text, type FlexProps } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";

interface SlotDetailsSubSectionProps {
  title: string;
}

export function SlotDetailsSubSection({
  title,
  children,
  ...props
}: PropsWithChildren<SlotDetailsSubSectionProps> & FlexProps) {
  return (
    <Flex direction="column" {...props}>
      <Text style={{ color: "var(--gray-12)" }} mb="2">
        {title}
      </Text>
      {children}
    </Flex>
  );
}
