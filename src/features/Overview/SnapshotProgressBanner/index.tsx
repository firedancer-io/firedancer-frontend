import { Flex, Text } from "@radix-ui/themes";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import { useAtomValue, useSetAtom } from "jotai";
import { clamp } from "lodash";
import Card from "../../../components/Card";
import Progress from "../../../components/Progress";
import { bootProgressAtom } from "../../../api/atoms";
import { BootPhaseEnum } from "../../../api/entities";
import {
  isStartupProgressExpandedAtom,
  showStartupProgressAtom,
} from "../../StartupProgress/atoms";
import { getSnapshotValues } from "../../StartupProgress/Firedancer/Snapshot/utils";
import styles from "./snapshotProgressBanner.module.css";

/**
 * Snapshot loading progress shown while the startup screen is collapsed,
 * which a fast boot does as soon as replay has caught up. Clicking it
 * reopens the startup screen.
 */
export default function SnapshotProgressBanner() {
  const showStartupProgress = useAtomValue(showStartupProgressAtom);
  const isExpanded = useAtomValue(isStartupProgressExpandedAtom);
  const setIsExpanded = useSetAtom(isStartupProgressExpandedAtom);
  const bootProgress = useAtomValue(bootProgressAtom);

  const phase = bootProgress?.phase;
  const isLoadingSnapshot =
    phase === BootPhaseEnum.loading_full_snapshot ||
    phase === BootPhaseEnum.loading_incremental_snapshot;
  if (!showStartupProgress || isExpanded || !bootProgress || !isLoadingSnapshot)
    return;

  const { insertCompressedBytes, totalCompressedBytes } =
    getSnapshotValues(bootProgress);
  const fraction = clamp(
    totalCompressedBytes && insertCompressedBytes
      ? insertCompressedBytes / totalCompressedBytes
      : 0,
    0,
    1,
  );
  const label =
    phase === BootPhaseEnum.loading_full_snapshot
      ? "Loading full snapshot"
      : "Loading incremental snapshot";

  const expand = () => setIsExpanded(true);

  return (
    <Card
      className={styles.banner}
      role="button"
      tabIndex={0}
      onClick={expand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") expand();
      }}
    >
      <Flex align="center" gap="3">
        <Text className={styles.label}>{label}</Text>
        <Progress
          value={fraction * 100}
          height="6px"
          className={styles.progress}
        />
        <Text className={styles.percent}>{Math.round(fraction * 100)}%</Text>
        <ChevronRightIcon />
      </Flex>
    </Card>
  );
}
