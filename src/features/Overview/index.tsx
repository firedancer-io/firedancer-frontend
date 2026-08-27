import TransactionsCard from "./TransactionsCard";
import ValidatorsCard from "./ValidatorsCard";
import StatusCard from "./StatusCard";
import ShredsProgression from "./ShredsProgression";
import SlotTimeline from "./SlotTimeline";
import ProgramCacheCard from "./ProgramCacheCard";
import AccountsCard from "./AccountsCard";
import styles from "./overview.module.css";
import { isFrankendancer } from "../../client";
import clsx from "clsx";
import { lazy, Suspense, useEffect, useState } from "react";

// Lazy: their eval leaves the critical window along with their mount
const SlotPerformance = lazy(() => import("./SlotPerformance"));
const LiveNetworkMetrics = lazy(() => import("./LiveNetworkMetrics"));
const LiveTileMetrics = lazy(() => import("./LiveTileMetrics"));

export default function Overview() {
  // Mount the below-fold sections two frames after the first data
  // commit (which now carries the sidebar rows), leaving that commit's
  // paint and the first flushes unopposed. Wrappers keep reserving
  // space via contain-intrinsic-size so nothing shifts.
  const [renderBelowFold, setRenderBelowFold] = useState(false);
  useEffect(() => {
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setRenderBelowFold(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={clsx(
        "rt-Flex rt-r-fd-column rt-r-gap-4 rt-r-fg-1",
        styles.overview,
      )}
    >
      <SlotTimeline />
      <div
        className={clsx("rt-Grid rt-r-gap-4", styles.cards, {
          [styles.frankendancer]: isFrankendancer,
        })}
      >
        <StatusCard />
        <ValidatorsCard className={styles.validatorsCard} />
        {!isFrankendancer && (
          <ProgramCacheCard className={styles.programCacheCard} />
        )}
        {!isFrankendancer && <AccountsCard className={styles.accountsCard} />}
        <TransactionsCard className={styles.txnsCard} />
      </div>
      <ShredsProgression />
      <div className={clsx(styles.belowFold, styles.slotPerformanceSection)}>
        {renderBelowFold && (
          <Suspense fallback={null}>
            <SlotPerformance />
          </Suspense>
        )}
      </div>
      <div className={clsx(styles.belowFold, styles.networkMetricsSection)}>
        {renderBelowFold && (
          <Suspense fallback={null}>
            <LiveNetworkMetrics />
          </Suspense>
        )}
      </div>
      <div className={clsx(styles.belowFold, styles.tileMetricsSection)}>
        {renderBelowFold && (
          <Suspense fallback={null}>
            <LiveTileMetrics />
          </Suspense>
        )}
      </div>
    </div>
  );
}
