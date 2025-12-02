import { useAtomValue } from "jotai";
import { tileCountAtom } from "../../../Overview/SlotPerformance/atoms";
import TileCard from "../../../Overview/SlotPerformance/TileCard";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { useTilesPerformance } from "../../../Overview/SlotPerformance/useTilesPerformance";
import { Flex } from "@radix-ui/themes";

export default function CpuSparklines() {
  const tileCounts = useAtomValue(tileCountAtom);
  const { queryIdleData } = useTilesPerformance();

  return (
    <SlotDetailsSubSection title="CPU Utilization">
      <Flex direction="column" gap="5px">
        <TileCard
          header="pack"
          tileCount={tileCounts["pack"]}
          queryIdlePerTile={queryIdleData?.["pack"]}
          statLabel="Full"
          metricType="pack"
          isDark
          isNarrow
        />
        <TileCard
          header="bank"
          tileCount={tileCounts["bank"]}
          queryIdlePerTile={queryIdleData?.["bank"]}
          statLabel="TPS"
          metricType="bank"
          isDark
          isNarrow
        />
      </Flex>
    </SlotDetailsSubSection>
  );
}
