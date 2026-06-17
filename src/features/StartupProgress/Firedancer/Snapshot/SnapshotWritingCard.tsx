import {
  SnapshotBarsCard,
  MSnapshotPath,
  SnapshotThroughput,
  SnapshotTotalComplete,
} from "./SnapshotBarsCard";
import { formatBytes } from "../../../../utils";

interface SnapshotWritingCardProps {
  decompressedThroughput?: number;
  decompressedCompleted?: number | null;
  decompressedTotal?: number | null;
  path?: string | null;
}
export function SnapshotWritingCard({
  decompressedThroughput,
  decompressedCompleted,
  decompressedTotal,
  path,
}: SnapshotWritingCardProps) {
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
      title="Writing"
      headerContent={
        <>
          <SnapshotTotalComplete completed={completedObj} total={totalObj} />
          <SnapshotThroughput prefix="Writing" throughput={throughputObj} />
        </>
      }
      footer={<MSnapshotPath path={path} />}
      throughput={decompressedThroughput}
      maxThroughput={3_500_000_000}
    />
  );
}
