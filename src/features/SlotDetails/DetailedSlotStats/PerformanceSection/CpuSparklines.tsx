import { useAtomValue } from "jotai";
import { tileCountAtom } from "../../../Overview/SlotPerformance/atoms";
import TileCard from "../../../Overview/SlotPerformance/TileCard";
import { SlotDetailsSubSection } from "../SlotDetailsSubSection";
import { useTilesPerformance } from "../../../Overview/SlotPerformance/useTilesPerformance";

export default function CpuSparklines() {
  const tileCounts = useAtomValue(tileCountAtom);
  const { queryIdleData } = useTilesPerformance();

  return (
    <SlotDetailsSubSection title="CPU Utilization" gap="1">
      <TileCard
        header="pack"
        tileCount={tileCounts["pack"]}
        queryIdlePerTile={queryIdleData?.["pack"]}
        statLabel="Full"
        metricType="pack"
        includeBg={false}
      />
      <TileCard
        header="bank"
        tileCount={tileCounts["bank"]}
        queryIdlePerTile={queryIdleData?.["bank"]}
        statLabel="TPS"
        metricType="bank"
        includeBg={false}
      />
    </SlotDetailsSubSection>
  );
}
