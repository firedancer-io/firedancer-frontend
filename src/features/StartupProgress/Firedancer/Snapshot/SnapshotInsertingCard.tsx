import { AccountsRate, SnapshotBarsCard } from "./SnapshotBarsCard";
import { getProgress, getThroughputCompleteCorrected } from "./utils";

interface SnapshotInsertingCardProps {
  emaDecompressedThroughput?: number;
  decompressedCompleted?: number | null;
  decompressedTotal?: number | null;
  cumulativeAccounts?: number | null;
  seedAccountsPerSecond?: number | null;
}
export function SnapshotInsertingCard({
  emaDecompressedThroughput,
  decompressedCompleted,
  decompressedTotal,
  cumulativeAccounts,
  seedAccountsPerSecond,
}: SnapshotInsertingCardProps) {
  const { isComplete, progressPct } = getProgress(
    decompressedCompleted,
    decompressedTotal,
  );
  const throughput = getThroughputCompleteCorrected(
    isComplete,
    emaDecompressedThroughput,
  );

  return (
    <SnapshotBarsCard
      title="Inserting"
      progressPct={progressPct}
      completed={decompressedCompleted}
      total={decompressedTotal}
      barsThroughput={throughput}
      maxThroughput={3_500_000_000}
      headerRightContent={
        <AccountsRate
          isComplete={isComplete}
          cumulativeAccounts={cumulativeAccounts}
          seedPerSecond={seedAccountsPerSecond}
        />
      }
    />
  );
}
