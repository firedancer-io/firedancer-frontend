import { Flex, Text, type FlexProps } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";
import RowSeparator from "../../../components/RowSeparator";

interface SlotDetailsSectionProps {
  title: string;
}

export function SlotDetailsSection({
  title,
  children,
  ...props
}: PropsWithChildren<SlotDetailsSectionProps & FlexProps>) {
  return (
    <Flex direction="column" flexBasis="0" flexGrow="1" {...props}>
      <Text size="3" style={{ fontWeight: 600 }}>
        {title}
      </Text>
      <RowSeparator my="0" mb="4" />
      {children}
    </Flex>
  );
}
