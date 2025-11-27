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
          <Flex
            flexGrow="1"
            justify="between"
            align="center"
            className={styles.decompressingCardLeft}
          >
            <SnapshotTitle text="Decompressing" />
            <SnapshotTotalComplete completed={completedObj} total={totalObj} />
          </Flex>
          <Flex
            gapX="30px"
            justify="end"
            flexGrow="1"
            className={styles.decompressingCardRight}
          >
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
