import { useAtomValue } from "jotai";
import { tileCountAtom } from "../../../Overview/SlotPerformance/atoms";
import TileCard from "../../../Overview/SlotPerformance/TileCard";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { useTilesPerformance } from "../../../Overview/SlotPerformance/useTilesPerformance";
import { Flex } from "@radix-ui/themes";
import { tileNames } from "../../../../utils";

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
          header={tileNames.bank}
          tileCount={tileCounts[tileNames.bank]}
          queryIdlePerTile={queryIdleData?.[tileNames.bank]}
          statLabel="TPS"
          metricType="bank"
          isDark
          isNarrow
        />
      </Flex>
    </SlotDetailsSubSection>
  );
}
