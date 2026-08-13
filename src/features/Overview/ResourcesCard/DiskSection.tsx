import { Flex, Text, Tooltip } from "@radix-ui/themes";
import type { SystemLive } from "../../../api/types";
import { formatSIBytesStr } from "../../../utils";
import SegmentedBar from "./SegmentedBar";
import LegendItem from "./LegendItem";
import { getDiskSummary, resourceColors } from "./utils";
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
                <Tooltip content={mount.name}>
                  <Text className={styles.mountName}>{mount.name}</Text>
                </Tooltip>
                <SegmentedBar
                  segments={segments}
                  total={summary.totalBytes}
                  ariaLabel={`${mount.name} disk usage`}
                />
                <Flex gap="10px" wrap="wrap">
                  {segments
                    .filter((segment) => segment.bytes > 0)
                    .map((segment) => (
                      <LegendItem
                        key={segment.key}
                        label={segment.label}
                        value={formatSIBytesStr(segment.bytes)}
                        color={segment.color}
                      />
                    ))}
                  <LegendItem
                    label="Total"
                    value={formatSIBytesStr(summary.totalBytes)}
                  />
                </Flex>
              </Flex>
            );
          })}
        </Flex>
      )}
    </Flex>
  );
}
