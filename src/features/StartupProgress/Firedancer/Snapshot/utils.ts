import { formatSIBytes } from "../../../../utils";
import { BootPhaseEnum } from "../../../../api/entities";
import type { BootProgress } from "../../../../api/types";

export function getProgress(
  completed: number | null | undefined,
  total: number | null | undefined,
) {
  const isComplete = completed != null && total != null && total === completed;

  return {
    isComplete,
    progressPct:
      completed == null || !total ? undefined : (completed / total) * 100,
  };
}

export function getThroughputCompleteCorrected(
  isComplete: boolean,
  emaThroughput: number | null | undefined,
) {
  return isComplete ? 0 : emaThroughput;
}
export function formatByteValue(value: number | null | undefined) {
  return value == null ? undefined : formatSIBytes(value);
}

export function getSnapshotValues(bootProgress: BootProgress) {
  const {
    loading_full_snapshot_total_bytes_compressed,
    loading_full_snapshot_read_bytes_compressed,
    loading_full_snapshot_decompress_bytes_compressed,
    loading_full_snapshot_decompress_bytes_decompressed,
    loading_full_snapshot_insert_bytes_decompressed,
    loading_full_snapshot_read_path,
    loading_full_snapshot_insert_accounts,
    loading_full_snapshot_insert_bytes_written,

    loading_incremental_snapshot_total_bytes_compressed,
    loading_incremental_snapshot_read_bytes_compressed,
    loading_incremental_snapshot_decompress_bytes_compressed,
    loading_incremental_snapshot_decompress_bytes_decompressed,
    loading_incremental_snapshot_insert_bytes_decompressed,
    loading_incremental_snapshot_read_path,
    loading_incremental_snapshot_insert_accounts,
    loading_incremental_snapshot_insert_bytes_written,

    accounts_database_path,
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
          insertBytesWritten: loading_full_snapshot_insert_bytes_written,
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
          insertBytesWritten: loading_incremental_snapshot_insert_bytes_written,
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

  return {
    ...values,
    insertCompressedBytes,
    totalDecompressedBytes,
    accountsDatabasePath: accounts_database_path,
  };
}
