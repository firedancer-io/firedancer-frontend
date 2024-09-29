import { startupProgressAtom } from "../../api/atoms";
import { useAtomValue } from "jotai";
import SnapshotProgress from "./SnapshotProgress";

export default function FullSnapshotProgress() {
  const startupProgress = useAtomValue(startupProgressAtom);

  if (!startupProgress) return;

  return (
    <SnapshotProgress
      currentBytes={startupProgress.downloading_full_snapshot_current_bytes}
      totalBytes={startupProgress.downloading_full_snapshot_total_bytes}
      remainingSecs={startupProgress.downloading_full_snapshot_remaining_secs}
    />
  );
}
