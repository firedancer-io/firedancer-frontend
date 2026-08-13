import { Flex, Text, Tooltip } from "@radix-ui/themes";
import type { SystemLive } from "../../../api/types";
import { formatSIBytesStr } from "../../../utils";
import SegmentedBar from "./SegmentedBar";
import { formatResourceUsage, getDiskSummary, resourceColors } from "./utils";
import styles from "./resourcesCard.module.css";

export default function DiskSection({
  mounts,
}: {
  mounts?: SystemLive["disk"];
}) {
  return (
    <Flex direction="column" gap="2" minWidth="0">
      <Text className={styles.sectionLabel}>Disk</Text>
      {!mounts ? (
        <div className={styles.diskPlaceholder} />
      ) : mounts.length === 0 ? (
        <Text className={styles.emptyText}>No validator filesystems</Text>
      ) : (
        <Flex direction="column" gap="3">
          {mounts.map((mount) => {
            const summary = getDiskSummary(mount);
            const value = formatResourceUsage(
              summary.firedancerBytes,
              summary.usedBytes,
              summary.totalBytes,
            );
            const segments = [
              ...summary.firedancerSegments,
              {
                key: "non-firedancer",
                label: "Non-Firedancer",
                bytes: summary.nonFiredancerBytes,
                color: resourceColors.other,
              },
              {
                key: "free",
                label: "Free",
                bytes: summary.freeBytes,
                color: resourceColors.available,
              },
            ];

            return (
              <Flex key={mount.name} direction="column" gap="1">
                <Flex justify="between" align="baseline" gap="3">
                  <Tooltip content={mount.name}>
                    <Text className={styles.mountName}>{mount.name}</Text>
                  </Tooltip>
                  <Text className={styles.sectionValue}>{value}</Text>
                </Flex>
                <SegmentedBar
                  segments={segments}
                  total={summary.totalBytes}
                  ariaLabel={`${mount.name} disk usage: ${value}`}
                />
                <Text className={styles.diskDetail}>
                  Firedancer: {formatSIBytesStr(summary.firedancerBytes)}
                </Text>
              </Flex>
            );
          })}
        </Flex>
      )}
    </Flex>
  );
}
