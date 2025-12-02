import { Flex } from "@radix-ui/themes";
import bodyStyles from "../body.module.css";
import styles from "./snapshot.module.css";
import { useMedia } from "react-use";
import { useAtomValue } from "jotai";
import { bootProgressAtom } from "../../../../api/atoms";
import { BootPhaseEnum } from "../../../../api/entities";
import type { BootProgress } from "../../../../api/types";
import SnapshotSparklineCard from "./SnapshotSparklineCard";
import { SnapshotReadingCard } from "./SnapshotReadingCard";
import { SnapshotDecompressingCard } from "./SnapshotDecompressingCard";
import { SnapshotInsertingCard } from "./SnapshotInsertingCard";
import PhaseHeader from "../PhaseHeader";
import { useEffect } from "react";
import { useEma } from "../../../../hooks/useEma";

const rowGap = "5";
const columnGap = "26px";

function getSnapshotValues(bootProgress: BootProgress) {
  const {
    loading_full_snapshot_total_bytes_compressed,
    loading_full_snapshot_read_bytes_compressed,
    loading_full_snapshot_decompress_bytes_compressed,
    loading_full_snapshot_decompress_bytes_decompressed,
    loading_full_snapshot_insert_bytes_decompressed,
    loading_full_snapshot_read_path,
    loading_full_snapshot_insert_accounts,

    loading_incremental_snapshot_total_bytes_compressed,
    loading_incremental_snapshot_read_bytes_compressed,
    loading_incremental_snapshot_decompress_bytes_compressed,
    loading_incremental_snapshot_decompress_bytes_decompressed,
    loading_incremental_snapshot_insert_bytes_decompressed,
    loading_incremental_snapshot_read_path,
    loading_incremental_snapshot_insert_accounts,
  } = bootProgress;

  const values =
    bootProgress.phase === BootPhaseEnum.loading_full_snapshot ||
    !loading_incremental_snapshot_total_bytes_compressed
      ? {
          totalCompressedBytes: loading_full_snapshot_total_bytes_compressed,
          readCompressedBytes: loading_full_snapshot_read_bytes_compressed,
          readPath: loading_full_snapshot_read_path,
          decompressCompressedBytes:
            loading_full_snapshot_decompress_bytes_compressed,
          decompressDecompressedBytes:
            loading_full_snapshot_decompress_bytes_decompressed,
          insertDecompressedBytes:
            loading_full_snapshot_insert_bytes_decompressed,
          insertAccounts: loading_full_snapshot_insert_accounts,
        }
      : {
          totalCompressedBytes:
            loading_incremental_snapshot_total_bytes_compressed,
          readCompressedBytes:
            loading_incremental_snapshot_read_bytes_compressed,
          readPath: loading_incremental_snapshot_read_path,
          decompressCompressedBytes:
            loading_incremental_snapshot_decompress_bytes_compressed,
          decompressDecompressedBytes:
            loading_incremental_snapshot_decompress_bytes_decompressed,
          insertDecompressedBytes:
            loading_incremental_snapshot_insert_bytes_decompressed,
          insertAccounts: loading_incremental_snapshot_insert_accounts,
        };

  const insertCompressedBytes =
    values.insertDecompressedBytes &&
    values.decompressCompressedBytes &&
    values.decompressDecompressedBytes
      ? values.insertDecompressedBytes *
        (values.decompressCompressedBytes / values.decompressDecompressedBytes)
      : 0;

  const totalDecompressedBytes =
    values.totalCompressedBytes &&
    values.decompressCompressedBytes &&
    values.decompressDecompressedBytes
      ? (values.totalCompressedBytes * values.decompressDecompressedBytes) /
        values.decompressCompressedBytes
      : 0;

  return { ...values, insertCompressedBytes, totalDecompressedBytes };
}

export default function Snapshot() {
  const bootProgress = useAtomValue(bootProgressAtom);
  const isIncremental =
    bootProgress?.phase === BootPhaseEnum.loading_incremental_snapshot;
  const isNarrowScreen = useMedia("(max-width: 560px)");
  const wrap = isNarrowScreen ? "wrap" : "nowrap";
  const gap = isNarrowScreen ? columnGap : rowGap;

  const snapshotValues = bootProgress
    ? getSnapshotValues(bootProgress)
    : undefined;

  const { ema: decompressedInputThroughput, reset } = useEma(
    snapshotValues?.insertDecompressedBytes,
  );

  useEffect(() => {
    // reset throughput history on phase change
    reset();
  }, [bootProgress?.phase, reset]);

  const {
    totalCompressedBytes,
    readCompressedBytes,
    readPath,
    decompressCompressedBytes,
    decompressDecompressedBytes,
    insertDecompressedBytes,
    insertAccounts,

    insertCompressedBytes,
    totalDecompressedBytes,
  } = snapshotValues ?? {};

  const remainingSeconds =
    decompressedInputThroughput == null ||
    totalDecompressedBytes == null ||
    insertDecompressedBytes == null
      ? undefined
      : Math.round(
          (totalDecompressedBytes - insertDecompressedBytes) /
            decompressedInputThroughput,
        );

  const phaseCompletePct = Math.min(
    totalCompressedBytes && insertCompressedBytes
      ? (insertCompressedBytes / totalCompressedBytes) * 100
      : 0,
    100,
  );

  if (!bootProgress || !snapshotValues) return;

  return (
    <>
      <PhaseHeader
        phase={bootProgress.phase}
        phaseCompletePct={phaseCompletePct}
        remainingSeconds={remainingSeconds}
      />
      <Flex
        mt="52px"
        direction="column"
        gap={columnGap}
        className={bodyStyles.startupContentIndentation}
      >
        <Flex className={styles.rowContainer} gap={gap} wrap={wrap}>
          <SnapshotReadingCard
            compressedCompleted={readCompressedBytes}
            compressedTotal={totalCompressedBytes}
            readPath={readPath}
          />
          <SnapshotSparklineCard
            title="CPU Utilization"
            tileType="snapld"
            isComplete={
              isIncremental &&
              !!readCompressedBytes &&
              readCompressedBytes === totalCompressedBytes
            }
          />
        </Flex>

        <Flex className={styles.rowContainer} gap={gap} wrap={wrap}>
          <SnapshotDecompressingCard
            compressedCompleted={decompressCompressedBytes}
            decompressedCompleted={decompressDecompressedBytes}
            compressedTotal={totalCompressedBytes}
          />
          <SnapshotSparklineCard
            title="CPU Utilization"
            tileType="snapdc"
            isComplete={
              isIncremental &&
              !!decompressCompressedBytes &&
              decompressCompressedBytes === totalCompressedBytes
            }
          />
        </Flex>

        <Flex className={styles.rowContainer} gap={gap} wrap={wrap}>
          <SnapshotInsertingCard
            decompressedThroughput={decompressedInputThroughput}
            decompressedCompleted={insertDecompressedBytes}
            decompressedTotal={totalDecompressedBytes}
            cumulativeAccounts={insertAccounts}
          />
          <SnapshotSparklineCard
            title="CPU Utilization"
            tileType="snapin"
            isComplete={
              isIncremental &&
              !!insertCompressedBytes &&
              insertCompressedBytes === totalCompressedBytes
            }
          />
        </Flex>
      </Flex>
    </>
  );
}
