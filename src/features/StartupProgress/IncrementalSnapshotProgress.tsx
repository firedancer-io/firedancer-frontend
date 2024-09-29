import { startupProgressAtom } from "../../api/atoms";
import { useAtomValue } from "jotai";
import SnapshotProgress from "./SnapshotProgress";

export default function IncrementalSnapshotProgress() {
  const startupProgress = useAtomValue(startupProgressAtom);

  if (!startupProgress) return;

  return (
    <SnapshotProgress
      currentBytes={
        startupProgress.downloading_incremental_snapshot_current_bytes
      }
      totalBytes={startupProgress.downloading_incremental_snapshot_total_bytes}
      remainingSecs={
        startupProgress.downloading_incremental_snapshot_remaining_secs
      }
    />
  );
}
