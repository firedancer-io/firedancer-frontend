import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import {
  SnapshotBarsCard,
  SnapshotThroughput,
  SnapshotTotalComplete,
} from "./SnapshotBarsCard";
import { formatBytes } from "../../../../utils";
import { useEma } from "../../../../hooks/useEma";

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
  const { ema: compressedThroughput, reset: resetCompressed } =
    useEma(compressedCompleted);

  const { ema: decompressedThroughput, reset: resetDecompressed } = useEma(
    decompressedCompleted,
  );

  useEffect(() => {
    // reset throughput history on phase change
    resetCompressed();
    resetDecompressed();
  }, [phase, resetCompressed, resetDecompressed]);

  const decompressedThroughputObj =
    decompressedThroughput == null
      ? undefined
      : formatBytes(decompressedThroughput);

  const completedObj =
    compressedCompleted == null ? undefined : formatBytes(compressedCompleted);
  const totalObj =
    compressedTotal == null ? undefined : formatBytes(compressedTotal);

  return (
    <SnapshotBarsCard
      title="Decompressing"
      headerContent={
        <>
          <SnapshotTotalComplete completed={completedObj} total={totalObj} />
          <SnapshotThroughput
            prefix="Output"
            throughput={decompressedThroughputObj}
          />
        </>
      }
      throughput={compressedThroughput}
      maxThroughput={800_000_000}
    />
  );
}
