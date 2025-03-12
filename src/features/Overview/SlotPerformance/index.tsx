import { Flex } from "@radix-ui/themes";
import CardHeader from "../../../components/CardHeader";
import SlotSankey from "./SlotSankey";
import TilesPerformance from "./TilesPerformance";
import Card from "../../../components/Card";
import SlotSelector from "./SlotSelector";
import SankeyControls from "./SankeyControls";
import styles from "./SlotSankey/slotSankey.module.css";
import ResetLive from "./ResetLive";
import LiveSankeyIndicator from "./LiveSankeyIndicator";

export default function SlotPerformance() {
  return (
    <Card>
      <Flex
        direction="column"
        gap="1"
        className={styles.slotPerformanceContainer}
      >
        <Flex gap="3">
          <CardHeader text="TPU Waterfall" />
          <LiveSankeyIndicator />
        </Flex>
        <SlotSelector />
        <SankeyContainer />
        <TilesPerformance />
      </Flex>
    </Card>
  );
}

function SankeyContainer() {
  return (
    <div className={styles.sankeyContainer}>
      <ResetLive />
      <SankeyControls />
      <SlotSankey />
    </div>
  );
}
