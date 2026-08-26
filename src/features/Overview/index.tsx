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
import styles from "./overview.module.css";
import { isFrankendancer } from "../../client";
import clsx from "clsx";

export default function Overview() {
  return (
    <Flex direction="column" gap="4" flexGrow="1" className={styles.overview}>
      <SlotTimeline />
      <Grid
        className={clsx(styles.cards, {
          [styles.frankendancer]: isFrankendancer,
        })}
        gap="4"
      >
        <StatusCard />
        <ValidatorsCard className={styles.validatorsCard} />
        {!isFrankendancer && (
          <ProgramCacheCard className={styles.programCacheCard} />
        )}
        {!isFrankendancer && <AccountsCard className={styles.accountsCard} />}
        <TransactionsCard className={styles.txnsCard} />
      </Grid>
      <ShredsProgression />
      <div className={clsx(styles.belowFold, styles.slotPerformanceSection)}>
        <SlotPerformance />
      </div>
      <div className={clsx(styles.belowFold, styles.networkMetricsSection)}>
        <LiveNetworkMetrics />
      </div>
      <div className={clsx(styles.belowFold, styles.tileMetricsSection)}>
        <LiveTileMetrics />
      </div>
    </Flex>
  );
}
