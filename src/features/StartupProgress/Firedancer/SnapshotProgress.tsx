import { Flex } from "@radix-ui/themes";
import { SnapshotLoadingCard } from "./SnapshotLoadingCard";
import { bootProgressAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import SnapshotSparklineCard from "./SnapshotSparklineCard";
import { BootPhaseEnum } from "../../../api/entities";
import type { BootProgress } from "../../../api/types";

const rowGap = "5";

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
      totalBytes: loading_full_snapshot_total_bytes_compressed,
      readBytes: loading_full_snapshot_read_bytes_compressed,
      readPath: loading_full_snapshot_read_path,
      decompressCompressedBytes:
        loading_full_snapshot_decompress_bytes_compressed,
      decompressDecompressedBytes:
        loading_full_snapshot_decompress_bytes_decompressed,
      insertBytes: loading_full_snapshot_insert_bytes_decompressed,
      insertAccounts: loading_full_snapshot_insert_accounts,
    };
  }

  return {
    totalBytes: loading_incremental_snapshot_total_bytes_compressed,
    readBytes: loading_incremental_snapshot_read_bytes_compressed,
    readPath: loading_incremental_snapshot_read_path,
    decompressCompressedBytes:
      loading_incremental_snapshot_decompress_bytes_compressed,
    decompressDecompressedBytes:
      loading_incremental_snapshot_decompress_bytes_decompressed,
    insertBytes: loading_incremental_snapshot_insert_bytes_decompressed,
    insertAccounts: loading_incremental_snapshot_insert_accounts,
  };
}

export function SnapshotProgress() {
  const bootProgress = useAtomValue(bootProgressAtom);
  if (!bootProgress) return;

  const {
    totalBytes,
    readBytes,
    readPath,
    decompressCompressedBytes,
    decompressDecompressedBytes,
    insertBytes,
    insertAccounts,
  } = getSnapshotValues(bootProgress);

  const insertCompletedBytes =
    insertBytes && decompressCompressedBytes && decompressDecompressedBytes
      ? insertBytes * (decompressCompressedBytes / decompressDecompressedBytes)
      : 0;

  return (
    <Flex direction="column" gap="40px">
      <Flex gap={rowGap}>
        <SnapshotLoadingCard
          title="Reading"
          completed={readBytes}
          total={totalBytes}
          footerText={readPath}
        />
        <SnapshotSparklineCard
          title="CPU Utilization"
          tileType="snaprd"
          isComplete={!!readBytes && readBytes === totalBytes}
        />
      </Flex>

      <Flex gap={rowGap}>
        <SnapshotLoadingCard
          title="Decompressing"
          completed={decompressCompressedBytes}
          total={totalBytes}
        />
        <SnapshotSparklineCard
          title="CPU Utilization"
          tileType="snapdc"
          isComplete={
            !!decompressCompressedBytes &&
            decompressCompressedBytes === totalBytes
          }
        />
      </Flex>

      <Flex gap={rowGap}>
        <SnapshotLoadingCard
          title="Inserting"
          completed={insertCompletedBytes}
          total={totalBytes}
          showAccountRate
          cumulativeAccounts={insertAccounts}
        />
        <SnapshotSparklineCard
          title="CPU Utilization"
          tileType="snapin"
          isComplete={
            !!insertCompletedBytes && insertCompletedBytes === totalBytes
          }
        />
      </Flex>
    </Flex>
  );
}
