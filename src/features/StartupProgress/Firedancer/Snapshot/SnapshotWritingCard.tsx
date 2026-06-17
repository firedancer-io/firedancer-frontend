import { SnapshotBarsCard, SnapshotThroughput } from "./SnapshotBarsCard";
import { getProgress, getThroughputCompleteCorrected } from "./utils";

interface SnapshotWritingCardProps {
  emaDecompressedThroughput?: number;
  decompressedCompleted?: number | null;
  decompressedTotal?: number | null;
  path?: string | null;
}
export function SnapshotWritingCard({
  emaDecompressedThroughput,
  decompressedCompleted,
  decompressedTotal,
  path,
}: SnapshotWritingCardProps) {
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
      title="Writing"
      progressPct={progressPct}
      completed={decompressedCompleted}
      total={decompressedTotal}
      barsThroughput={throughput}
      maxThroughput={3_500_000_000}
      headerRightContent={
        <SnapshotThroughput prefix="Writing" throughput={throughput} />
      }
      footerText={path}
    />
  );
}
