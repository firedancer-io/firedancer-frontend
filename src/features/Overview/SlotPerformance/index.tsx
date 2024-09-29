import { Box, Flex } from "@radix-ui/themes";
import CardHeader from "../../../components/CardHeader";
import SlotSankey from "./SlotSankey";
import TilesPerformance from "./TilesPerformance";
import Card from "../../../components/Card";
import SlotSelector from "./SlotSelector";
import SankeyControls from "./SankeyControls";
import styles from "./slotPerformance.module.css";  
import ResetLive from "./ResetLive";
import LiveSankeyIndicator from "./LiveSankeyIndicator";

export default function SlotPerformance() {
  return (
    <Card>
      <Flex direction="column" gap="1">
        <Flex gap="3">
          <CardHeader text="TPU Waterfall" />
          <LiveSankeyIndicator />
        </Flex>
        <SlotSelector />
        <Box className={styles.sankey}>
          <ResetLive />
          <SankeyControls />
          <SlotSankey />
        </Box>
        <TilesPerformance />
      </Flex>
    </Card>
  );
}
