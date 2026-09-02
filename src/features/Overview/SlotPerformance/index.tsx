import { Flex } from "@radix-ui/themes";
import CardHeader from "../../../components/CardHeader";
import SlotSankey from "./SlotSankey";
import TilesPerformance from "./TilesPerformance";
import Card from "../../../components/Card";
import SankeyControls from "./SankeyControls";
import styles from "./SlotSankey/slotSankey.module.css";
import { useAtomValue } from "jotai";
import { isBlockProductionEnabledAtom } from "../../../atoms";

export default function SlotPerformance() {
  const isBlockProductionEnabled = useAtomValue(isBlockProductionEnabledAtom);

  return (
    <Card>
      <Flex
        direction="column"
        gap="1"
        className={styles.slotPerformanceContainer}
      >
        {isBlockProductionEnabled && (
          <>
            <Flex gap="3">
              <CardHeader text="TPU Waterfall" />
            </Flex>
            <SankeyContainer />
          </>
        )}
        <TilesPerformance />
      </Flex>
    </Card>
  );
}

function SankeyContainer() {
  return (
    <div className={styles.sankeyContainer}>
      <SankeyControls />
      <div className={styles.slotSankeyContainer}>
        <SlotSankey />
      </div>
    </div>
  );
}
