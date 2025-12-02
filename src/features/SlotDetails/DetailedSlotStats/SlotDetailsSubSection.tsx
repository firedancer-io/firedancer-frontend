import { Flex, Text, type FlexProps } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";
import styles from "./detailedSlotStats.module.css";

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
      <Text className={styles.subheader} mb="5px">
        {title}
      </Text>
      {children}
    </Flex>
  );
}
