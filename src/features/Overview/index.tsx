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
import { useEffect, useState } from "react";

export default function Overview() {
  // Mount the below-fold sections one frame after the gated first commit
  // (sidebar follower pattern); their wrappers keep reserving space via
  // contain-intrinsic-size so nothing shifts.
  const [renderBelowFold, setRenderBelowFold] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRenderBelowFold(true));
    return () => cancelAnimationFrame(raf);
  }, []);

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
        {renderBelowFold && <SlotPerformance />}
      </div>
      <div className={clsx(styles.belowFold, styles.networkMetricsSection)}>
        {renderBelowFold && <LiveNetworkMetrics />}
      </div>
      <div className={clsx(styles.belowFold, styles.tileMetricsSection)}>
        {renderBelowFold && <LiveTileMetrics />}
      </div>
    </Flex>
  );
}
