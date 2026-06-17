import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { SnapshotBarsCard, SnapshotThroughput } from "./SnapshotBarsCard";
import { useEma } from "../../../../hooks/useEma";
import { getProgress, getThroughputCompleteCorrected } from "./utils";

interface SnapshotDecompressingCardProps {
  compressedCompleted?: number | null;
  decompressedCompleted?: number | null;
  compressedTotal?: number | null;
}
export function SnapshotDecompressingCard({
  compressedCompleted,
  decompressedCompleted,
  compressedTotal,
}: SnapshotDecompressingCardProps) {
  const phase = useAtomValue(bootProgressPhaseAtom);
  const { isComplete, progressPct } = getProgress(
    compressedCompleted,
    compressedTotal,
  );
  const { ema: emaCompressedThroughput, reset: resetCompressed } =
    useEma(compressedCompleted);
  const compressedThroughput = getThroughputCompleteCorrected(
    isComplete,
    emaCompressedThroughput,
  );

  const { ema: emaDecompressedThroughput, reset: resetDecompressed } = useEma(
    decompressedCompleted,
  );
  const decompressedThroughput = getThroughputCompleteCorrected(
    isComplete,
    emaDecompressedThroughput,
  );

  useEffect(() => {
    // reset throughput history on phase change
    resetCompressed();
    resetDecompressed();
  }, [phase, resetCompressed, resetDecompressed]);

  return (
    <SnapshotBarsCard
      title="Decompressing"
      progressPct={progressPct}
      completed={compressedCompleted}
      total={compressedTotal}
      barsThroughput={compressedThroughput}
      maxThroughput={800_000_000}
      headerRightContent={
        <SnapshotThroughput
          prefix="Output"
          throughput={decompressedThroughput}
        />
      }
    />
  );
}
