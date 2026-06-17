import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import {
  SnapshotBarsCard,
  MSnapshotPath,
  SnapshotThroughput,
  SnapshotTotalComplete,
} from "./SnapshotBarsCard";
import { formatBytes } from "../../../../utils";
import { useEma } from "../../../../hooks/useEma";

interface SnapshotReadingCardProps {
  compressedCompleted?: number | null;
  compressedTotal?: number | null;
  path?: string | null;
}
export function SnapshotReadingCard({
  compressedCompleted: completed,
  compressedTotal: total,
  path,
}: SnapshotReadingCardProps) {
  const phase = useAtomValue(bootProgressPhaseAtom);
  const { ema: throughput, reset } = useEma(completed);

  useEffect(() => {
    // reset throughput history on phase change
    reset();
  }, [phase, reset]);

  const throughputObj =
    throughput == null ? undefined : formatBytes(throughput);
  const completedObj = completed == null ? undefined : formatBytes(completed);
  const totalObj = total == null ? undefined : formatBytes(total);

  return (
    <SnapshotBarsCard
      title="Reading"
      headerContent={
        <>
          <SnapshotTotalComplete completed={completedObj} total={totalObj} />
          <SnapshotThroughput throughput={throughputObj} />
        </>
      }
      footer={<MSnapshotPath path={path} />}
      throughput={throughput}
      maxThroughput={800_000_000}
    />
  );
}
