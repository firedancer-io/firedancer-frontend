import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import {
  SnapshotBarsCard,
  SnapshotReadPath,
  SnapshotThroughput,
  SnapshotTitle,
  SnapshotTotalComplete,
} from "./SnapshotBarsCard";
import { formatBytes } from "../../../../utils";
import styles from "./snapshot.module.css";
import { useEma } from "../../../../hooks/useEma";

interface SnapshotReadingCardProps {
  compressedCompleted?: number | null;
  compressedTotal?: number | null;
  readPath?: string | null;
}
export function SnapshotReadingCard({
  compressedCompleted: completed,
  compressedTotal: total,
  readPath,
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

  const footer = useMemo(() => {
    return <SnapshotReadPath readPath={readPath} />;
  }, [readPath]);

  return (
    <SnapshotBarsCard
      containerClassName={styles.readingCard}
      headerContent={
        <>
          <SnapshotTitle text="Reading" />
          <SnapshotTotalComplete completed={completedObj} total={totalObj} />
          <SnapshotThroughput throughput={throughputObj} />
        </>
      }
      footer={footer}
      throughput={throughput}
    />
  );
}
