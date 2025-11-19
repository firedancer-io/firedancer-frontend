import { useValuePerSecond } from "../useValuePerSecond";
import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import {
  AccountsRate,
  SnapshotBarsCard,
  SnapshotThroughput,
  SnapshotTitle,
  SnapshotTotalComplete,
} from "./SnapshotBarsCard";
import { formatBytes } from "../../../../utils";
import styles from "./snapshot.module.css";

interface SnapshotInsertingCardProps {
  decompressedCompleted?: number | null;
  decompressedTotal?: number | null;
  cumulativeAccounts?: number | null;
}
export function SnapshotInsertingCard({
  decompressedCompleted,
  decompressedTotal,
  cumulativeAccounts,
}: SnapshotInsertingCardProps) {
  const phase = useAtomValue(bootProgressPhaseAtom);
  const { valuePerSecond: decompressedThroughput, reset } = useValuePerSecond(
    decompressedCompleted,
    1_000,
  );

  useEffect(() => {
    // reset throughput history on phase change
    reset();
  }, [phase, reset]);

  const throughputObj =
    decompressedThroughput == null
      ? undefined
      : formatBytes(decompressedThroughput);
  const completedObj =
    decompressedCompleted == null
      ? undefined
      : formatBytes(decompressedCompleted);
  const totalObj =
    decompressedTotal == null ? undefined : formatBytes(decompressedTotal);

  return (
    <SnapshotBarsCard
      containerClassName={styles.insertingCard}
      headerContent={
        <>
          <SnapshotTitle text="Inserting" />
          <AccountsRate cumulativeAccounts={cumulativeAccounts} />
          <SnapshotTotalComplete completed={completedObj} total={totalObj} />
          <SnapshotThroughput throughput={throughputObj} />
        </>
      }
      throughput={decompressedThroughput}
    />
  );
}
