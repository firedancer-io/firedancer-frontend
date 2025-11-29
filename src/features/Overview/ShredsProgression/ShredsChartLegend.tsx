import { Flex, Text } from "@radix-ui/themes";
import { legend } from "./const";
import styles from "./shreds.module.css";

export function ShredsChartLegend() {
  return (
    <Flex gap="15px" wrap="wrap">
      {Object.entries(legend).map(([label, color]) => {
        return (
          <Flex key={label} gap="5px" flexShrink="0">
            <div
              className={styles.legendColorBox}
              style={{ backgroundColor: color }}
            />
            <Text className={styles.legendLabel}>{label}</Text>
          </Flex>
        );
      })}
    </Flex>
  );
}
