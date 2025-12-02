import { Box, Flex, Text, type FlexProps } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";
import RowSeparator from "../../../components/RowSeparator";
import styles from "./detailedSlotStats.module.css";
import { sectionGapY } from "./consts";

interface SlotDetailsSectionProps {
  title: string;
}

export function SlotDetailsSection({
  title,
  children,
  ...props
}: PropsWithChildren<SlotDetailsSectionProps & FlexProps>) {
  return (
    <Flex
      direction="column"
      flexBasis="0"
      flexGrow="1"
      gap={sectionGapY}
      {...props}
    >
      <Box>
        <Text className={styles.header}>{title}</Text>
        <RowSeparator my="0" />
      </Box>
      {children}
    </Flex>
  );
}
