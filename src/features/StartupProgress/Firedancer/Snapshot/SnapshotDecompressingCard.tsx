import { useValuePerSecond } from "../useValuePerSecond";
import { bootProgressPhaseAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import {
  SnapshotBarsCard,
  SnapshotThroughput,
  SnapshotTitle,
  SnapshotTotalComplete,
} from "./SnapshotBarsCard";
import { Flex } from "@radix-ui/themes";
import { formatBytes } from "../../../../utils";
import styles from "./snapshot.module.css";

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
  const { valuePerSecond: compressedThroughput, reset: resetCompressed } =
    useValuePerSecond(compressedCompleted, 1_000);

  const { valuePerSecond: decompressedThroughput, reset: resetDecompressed } =
    useValuePerSecond(decompressedCompleted, 1_000);

  useEffect(() => {
    // reset throughput history on phase change
    resetCompressed();
    resetDecompressed();
  }, [phase, resetCompressed, resetDecompressed]);

  const compressedThroughputObj =
    compressedThroughput == null
      ? undefined
      : formatBytes(compressedThroughput);
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
      containerClassName={styles.decompressingCard}
      headerContent={
        <>
          <SnapshotTitle text="Decompressing" />
          <SnapshotTotalComplete completed={completedObj} total={totalObj} />
          <Flex gapX="30px" justify="between" className={styles.throughputs}>
            <SnapshotThroughput
              prefix="Input"
              throughput={compressedThroughputObj}
            />
            <SnapshotThroughput
              prefix="Output"
              throughput={decompressedThroughputObj}
            />
          </Flex>
        </>
      }
      throughput={compressedThroughput}
    />
  );
}
