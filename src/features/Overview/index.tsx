import { Flex, Grid } from "@radix-ui/themes";
import TransactionsCard from "./TransactionsCard";
import SlotPerformance from "./SlotPerformance";
import ValidatorsCard from "./ValidatorsCard";
import StatusCard from "./StatusCard";
import ShredsProgression from "./ShredsProgression";
import LiveNetworkMetrics from "./LiveNetworkMetrics";
import LiveTileMetrics from "./LiveTileMetrics";
import SlotTimeline from "./SlotTimeline";
import ProgramCacheCard from "./ProgramCacheCard";
import AccountsCard from "./AccountsCard";
import ResourcesCard from "./ResourcesCard";
import styles from "./overview.module.css";

export default function Overview() {
  return (
    <Flex direction="column" gap="4" flexGrow="1">
      <Grid className={styles.cards} gap="4">
        <StatusCard className={styles.statusCard} />
        <SlotTimeline className={styles.slotsCard} />
        <ValidatorsCard className={styles.validatorsCard} />
        <ProgramCacheCard className={styles.programCacheCard} />
        <AccountsCard className={styles.accountsCard} />
        <TransactionsCard className={styles.txnsCard} />
      </Grid>
      <ResourcesCard />
      <ShredsProgression />
      <SlotPerformance />
      <LiveNetworkMetrics />
      <LiveTileMetrics />
    </Flex>
  );
}
