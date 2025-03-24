import { startupProgressAtom } from "../../api/atoms";
import { useAtomValue } from "jotai";
import { Flex } from "@radix-ui/themes";
import ValueDisplay from "./ValueDisplay";
import byteSize from "byte-size";

export default function IncrementalSnapshotStats() {
  const startupProgress = useAtomValue(startupProgressAtom);

  if (!startupProgress) return;

  const throughput = startupProgress.downloading_incremental_snapshot_throughput
    ? `${byteSize(startupProgress.downloading_incremental_snapshot_throughput).toString()}/s`
    : "-";

  return (
    <Flex>
      <ValueDisplay
        label="Peer"
        value={startupProgress.downloading_incremental_snapshot_peer}
      />
      <ValueDisplay
        label="Slot"
        value={startupProgress.downloading_incremental_snapshot_slot}
      />
      <ValueDisplay label="Throughput" value={throughput} />
    </Flex>
  );
}
