import { Flex } from "@radix-ui/themes";

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
import { PhaseHeader } from "../PhaseHeader";

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

  if (
    bootProgress.phase === BootPhaseEnum.loading_full_snapshot ||
    !loading_incremental_snapshot_total_bytes_compressed
  ) {
    return {
      totalCompressedBytes: loading_full_snapshot_total_bytes_compressed,
      readCompressedBytes: loading_full_snapshot_read_bytes_compressed,
      readPath: loading_full_snapshot_read_path,
      decompressCompressedBytes:
        loading_full_snapshot_decompress_bytes_compressed,
      decompressDecompressedBytes:
        loading_full_snapshot_decompress_bytes_decompressed,
      insertDecompressedBytes: loading_full_snapshot_insert_bytes_decompressed,
      insertAccounts: loading_full_snapshot_insert_accounts,
    };
  }

  return {
    totalCompressedBytes: loading_incremental_snapshot_total_bytes_compressed,
    readCompressedBytes: loading_incremental_snapshot_read_bytes_compressed,
    readPath: loading_incremental_snapshot_read_path,
    decompressCompressedBytes:
      loading_incremental_snapshot_decompress_bytes_compressed,
    decompressDecompressedBytes:
      loading_incremental_snapshot_decompress_bytes_decompressed,
    insertDecompressedBytes:
      loading_incremental_snapshot_insert_bytes_decompressed,
    insertAccounts: loading_incremental_snapshot_insert_accounts,
  };
}

export default function Snapshot() {
  const bootProgress = useAtomValue(bootProgressAtom);
  const isIncremental =
    bootProgress?.phase === BootPhaseEnum.loading_incremental_snapshot;
  const isNarrowScreen = useMedia("(max-width: 560px)");
  const wrap = isNarrowScreen ? "wrap" : "nowrap";
  const gap = isNarrowScreen ? columnGap : rowGap;

  if (!bootProgress) return;

  const {
    totalCompressedBytes,
    readCompressedBytes,
    readPath,
    decompressCompressedBytes,
    decompressDecompressedBytes,
    insertDecompressedBytes,
    insertAccounts,
  } = getSnapshotValues(bootProgress);

  const insertCompressedBytes =
    insertDecompressedBytes &&
    decompressCompressedBytes &&
    decompressDecompressedBytes
      ? insertDecompressedBytes *
        (decompressCompressedBytes / decompressDecompressedBytes)
      : 0;

  const totalDecompressedBytes =
    totalCompressedBytes &&
    decompressCompressedBytes &&
    decompressDecompressedBytes
      ? (totalCompressedBytes * decompressDecompressedBytes) /
        decompressCompressedBytes
      : 0;

  return (
    <>
      <PhaseHeader phase={bootProgress.phase} />
      <Flex direction="column" mt="52px" gap={columnGap}>
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
