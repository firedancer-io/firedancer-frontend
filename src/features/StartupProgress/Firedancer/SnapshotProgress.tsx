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
    loading_full_snapshot_total_bytes,
    loading_full_snapshot_read_remaining,
    loading_full_snapshot_read_bytes,
    loading_full_snapshot_read_throughput,

    loading_full_snapshot_decompress_remaining,
    loading_full_snapshot_decompress_throughput,
    loading_full_snapshot_decompress_compressed_bytes,
    loading_full_snapshot_decompress_decompressed_bytes,

    loading_full_snapshot_insert_remaining,
    loading_full_snapshot_insert_bytes,
    loading_full_snapshot_insert_throughput,

    loading_incremental_snapshot_total_bytes,
    loading_incremental_snapshot_read_remaining,
    loading_incremental_snapshot_read_bytes,
    loading_incremental_snapshot_read_throughput,

    loading_incremental_snapshot_decompress_remaining,
    loading_incremental_snapshot_decompress_throughput,
    loading_incremental_snapshot_decompress_compressed_bytes,
    loading_incremental_snapshot_decompress_decompressed_bytes,

    loading_incremental_snapshot_insert_remaining,
    loading_incremental_snapshot_insert_bytes,
    loading_incremental_snapshot_insert_throughput,
  } = bootProgress;

  if (
    bootProgress.phase === BootPhaseEnum.loading_full_snapshot ||
    !loading_incremental_snapshot_total_bytes
  ) {
    return {
      total_bytes: loading_full_snapshot_total_bytes,
      read_remaining: loading_full_snapshot_read_remaining,
      read_bytes: loading_full_snapshot_read_bytes,
      read_throughput: loading_full_snapshot_read_throughput,
      decompress_remaining: loading_full_snapshot_decompress_remaining,
      decompress_throughput: loading_full_snapshot_decompress_throughput,
      decompress_compressed_bytes:
        loading_full_snapshot_decompress_compressed_bytes,
      decompress_decompressed_bytes:
        loading_full_snapshot_decompress_decompressed_bytes,
      insert_remaining: loading_full_snapshot_insert_remaining,
      insert_bytes: loading_full_snapshot_insert_bytes,
      insert_throughput: loading_full_snapshot_insert_throughput,
    };
  }

  return {
    total_bytes: loading_incremental_snapshot_total_bytes,
    read_remaining: loading_incremental_snapshot_read_remaining,
    read_bytes: loading_incremental_snapshot_read_bytes,
    read_throughput: loading_incremental_snapshot_read_throughput,
    decompress_remaining: loading_incremental_snapshot_decompress_remaining,
    decompress_throughput: loading_incremental_snapshot_decompress_throughput,
    decompress_compressed_bytes:
      loading_incremental_snapshot_decompress_compressed_bytes,
    decompress_decompressed_bytes:
      loading_incremental_snapshot_decompress_decompressed_bytes,
    insert_remaining: loading_incremental_snapshot_insert_remaining,
    insert_bytes: loading_incremental_snapshot_insert_bytes,
    insert_throughput: loading_incremental_snapshot_insert_throughput,
  };
}

export function SnapshotProgress() {
  const bootProgress = useAtomValue(bootProgressAtom);
  if (!bootProgress) return;

  const {
    total_bytes,
    read_remaining,
    read_bytes,
    read_throughput,
    decompress_remaining,
    decompress_throughput,
    decompress_compressed_bytes,
    decompress_decompressed_bytes,
    insert_remaining,
    insert_bytes,
    insert_throughput,
  } = getSnapshotValues(bootProgress);

  const insertCompletedBytes =
    insert_bytes && decompress_compressed_bytes && decompress_decompressed_bytes
      ? insert_bytes *
        (decompress_compressed_bytes / decompress_decompressed_bytes)
      : 0;

  return (
    <Flex direction="column" gap="40px">
      <Flex gap={rowGap}>
        <SnapshotLoadingCard
          title="Reading"
          estimatedRemaining={read_remaining}
          throughput={read_throughput}
          completed={read_bytes}
          total={total_bytes}
        />
        <SnapshotSparklineCard
          title="CPU Utilization"
          tileType="snaprd"
          isComplete={!!read_remaining && read_remaining === total_bytes}
        />
      </Flex>

      <Flex gap={rowGap}>
        <SnapshotLoadingCard
          title="Decompressing"
          estimatedRemaining={decompress_remaining}
          throughput={decompress_throughput}
          completed={decompress_compressed_bytes}
          total={total_bytes}
        />
        <SnapshotSparklineCard
          title="CPU Utilization"
          tileType="snapdc"
          isComplete={
            !!decompress_compressed_bytes &&
            decompress_compressed_bytes === total_bytes
          }
        />
      </Flex>

      <Flex gap={rowGap}>
        <SnapshotLoadingCard
          title="Inserting"
          estimatedRemaining={insert_remaining}
          throughput={insert_throughput}
          completed={insertCompletedBytes}
          total={total_bytes}
        />
        <SnapshotSparklineCard
          title="CPU Utilization"
          tileType="snapin"
          isComplete={
            !!insertCompletedBytes && insertCompletedBytes === total_bytes
          }
        />
      </Flex>
    </Flex>
  );
}
