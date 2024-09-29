import { Progress } from "@radix-ui/themes";
import { startupProgressAtom } from "../../api/atoms";
import { useAtomValue } from "jotai";
import ValueDisplay from "./ValueDisplay";
import styles from "./startupProgress.module.css";

export function SupermajorityStakeStats() {
  const startupProgress = useAtomValue(startupProgressAtom);

  if (!startupProgress) return null;

  return (
    <ValueDisplay
      label="Slot"
      value={startupProgress.waiting_for_supermajority_slot}
    />
  );
}

export function SupermajorityStakeProgress() {
  const startupProgress = useAtomValue(startupProgressAtom);

  if (!startupProgress) return null;

  return (
    <Progress
      value={startupProgress.waiting_for_supermajority_stake_percent || 0}
      className={styles.progress}
    />
  );
}
