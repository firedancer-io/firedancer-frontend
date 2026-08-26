import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { SnapshotBarsCard, SnapshotThroughput } from "./SnapshotBarsCard";
import { useEma } from "../../../../hooks/useEma";
import {
  getProgress,
  getSeedRate,
  getThroughputCompleteCorrected,
} from "./utils";

interface SnapshotReadingCardProps {
  compressedCompleted?: number | null;
  compressedTotal?: number | null;
  elapsedSeconds?: number | null;
  path?: string | null;
}
export function SnapshotReadingCard({
  compressedCompleted,
  compressedTotal,
  elapsedSeconds,
  path,
}: SnapshotReadingCardProps) {
  const phase = useAtomValue(bootProgressPhaseAtom);
  const { isComplete, progressPct } = getProgress(
    compressedCompleted,
    compressedTotal,
  );

  const { ema: emaThroughput, reset } = useEma(compressedCompleted, {
    seedRate: getSeedRate(compressedCompleted, elapsedSeconds),
  });
  const throughput = getThroughputCompleteCorrected(isComplete, emaThroughput);

  useEffect(() => {
    // reset throughput history on phase change
    reset();
  }, [phase, reset]);

  return (
    <SnapshotBarsCard
      title="Reading"
      progressPct={progressPct}
      completed={compressedCompleted}
      total={compressedTotal}
      barsThroughput={throughput}
      maxThroughput={800_000_000}
      headerRightContent={<SnapshotThroughput throughput={throughput} />}
      footerText={path}
    />
  );
}
