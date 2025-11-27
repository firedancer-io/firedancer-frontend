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
  decompressedThroughput?: number;
  decompressedCompleted?: number | null;
  decompressedTotal?: number | null;
  cumulativeAccounts?: number | null;
}
export function SnapshotInsertingCard({
  decompressedThroughput,
  decompressedCompleted,
  decompressedTotal,
  cumulativeAccounts,
}: SnapshotInsertingCardProps) {
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
