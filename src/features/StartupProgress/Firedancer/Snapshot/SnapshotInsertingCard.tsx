import {
  AccountsRate,
  SnapshotBarsCard,
  SnapshotThroughput,
  SnapshotTitle,
  SnapshotTotalComplete,
} from "./SnapshotBarsCard";
import { formatSIBytes } from "../../../../utils";
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
      : formatSIBytes(decompressedThroughput);
  const completedObj =
    decompressedCompleted == null
      ? undefined
      : formatSIBytes(decompressedCompleted);
  const totalObj =
    decompressedTotal == null ? undefined : formatSIBytes(decompressedTotal);

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
      maxThroughput={3_500_000_000}
    />
  );
}
