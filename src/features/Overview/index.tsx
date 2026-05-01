import { Flex, Grid } from "@radix-ui/themes";
import TransactionsCard from "./TransactionsCard";
import SlotPerformance from "./SlotPerformance";
import ValidatorsCard from "./ValidatorsCard";
import SlotStatusCard from "./StatusCard";
import EpochCard from "./EpochCard";
import ShredsProgression from "./ShredsProgression";
import LiveNetworkMetrics from "./LiveNetworkMetrics";
import LiveTileMetrics from "./LiveTileMetrics";
import SlotTimeline from "./SlotTimeline";
import ProgramCacheCard from "./ProgramCacheCard";
import styles from "./overview.module.css";

export default function Overview() {
  return (
    <Flex direction="column" gap="4" flexGrow="1">
      <SlotTimeline />
      <Grid className={styles.cards} gap="4">
        <EpochCard />
        <SlotStatusCard />
        <ValidatorsCard />
        <ProgramCacheCard />
        <TransactionsCard className={styles.txnsCard} />
      </Grid>
      <ShredsProgression />
      <SlotPerformance />
      <LiveNetworkMetrics />
      <LiveTileMetrics />
    </Flex>
  );
}
