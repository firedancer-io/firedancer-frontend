import { Flex } from "@radix-ui/themes";
import {
  AccountsRate,
  SnapshotBarsCard,
  SnapshotThroughput,
} from "./SnapshotBarsCard";
import { getProgress, getThroughputCompleteCorrected } from "./utils";

interface SnapshotInsertingCardProps {
  emaDecompressedThroughput?: number;
  decompressedCompleted?: number | null;
  decompressedTotal?: number | null;
  cumulativeAccounts?: number | null;
  emaWrittenThroughput?: number;
  path?: string | null;
}
export function SnapshotInsertingCard({
  emaDecompressedThroughput,
  decompressedCompleted,
  decompressedTotal,
  cumulativeAccounts,
  emaWrittenThroughput,
  path,
}: SnapshotInsertingCardProps) {
  const { isComplete, progressPct } = getProgress(
    decompressedCompleted,
    decompressedTotal,
  );
  const throughput = getThroughputCompleteCorrected(
    isComplete,
    emaDecompressedThroughput,
  );
  const writtenThroughput = getThroughputCompleteCorrected(
    isComplete,
    emaWrittenThroughput,
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
        <Flex direction="column">
          <AccountsRate
            isComplete={isComplete}
            cumulativeAccounts={cumulativeAccounts}
          />
          <SnapshotThroughput prefix="Writing" throughput={writtenThroughput} />
        </Flex>
      }
      footerText={path}
    />
  );
}
