import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { liveTileMetricsAtom } from "../../../api/atoms";
import { PriorityEnum } from "../../../api/entities";
import tableStyles from "./../../../components/dataTable.module.css";
import { Flex, Text } from "@radix-ui/themes";

export default function PriorityCountCell() {
  const liveTileMetrics = useAtomValue(liveTileMetricsAtom);
  const priority = liveTileMetrics?.priority;
  const alive = liveTileMetrics?.alive;

  const counts = useMemo(() => {
    if (!priority || !alive) return null;
    let critical = 0;
    let pinned = 0;
    let floating = 0;
    for (let i = 0; i < priority.length; i++) {
      // A shutdown tile is not displayed in the table, so exclude it from the count
      const isShutdown = alive[i] === 2;
      if (isShutdown) continue;

      switch (priority[i]) {
        case PriorityEnum.critical:
          critical++;
          break;
        case PriorityEnum.normal:
        case PriorityEnum.startup:
          pinned++;
          break;
        case PriorityEnum.floating:
          floating++;
          break;
      }
    }
    return { critical, pinned, floating };
  }, [alive, priority]);

  if (!counts) return null;

  return (
    <Flex className={tableStyles.priorityCount} gap="5px" justify="between">
      <Text>
        {counts.critical} <Text className={tableStyles.critical}>C</Text>
      </Text>
      <Text>
        {counts.pinned} <Text className={tableStyles.pinned}>P</Text>
      </Text>
      <Text>
        {counts.floating} <Text className={tableStyles.floating}>F</Text>
      </Text>
    </Flex>
  );
}
