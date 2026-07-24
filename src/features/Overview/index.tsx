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
import styles from "./overview.module.css";
import { isFrankendancer } from "../../client";
import clsx from "clsx";

export default function Overview() {
  return (
    <Flex direction="column" gap="4" flexGrow="1">
      <SlotTimeline />
      <Grid
        className={clsx(styles.cards, {
          [styles.frankendancer]: isFrankendancer,
        })}
        gap="4"
      >
        <StatusCard />
        <ValidatorsCard />
        {!isFrankendancer && <ProgramCacheCard />}
        <TransactionsCard className={styles.txnsCard} />
      </Grid>
      <ShredsProgression />
      <SlotPerformance />
      <LiveNetworkMetrics />
      <LiveTileMetrics />
    </Flex>
  );
}
