import { Flex, Text, Tooltip } from "@radix-ui/themes";
import type { SystemLive } from "../../../api/types";
import { formatSIBytesStr } from "../../../utils";
import SectionHeading from "./SectionHeading";
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
    <Flex direction="column" gap="3" minWidth="0">
      <SectionHeading
        label="Disk"
        value={
          mounts
            ? `${mounts.length} mount${mounts.length === 1 ? "" : "s"}`
            : undefined
        }
      />
      {!mounts ? (
        <div className={styles.diskPlaceholder} />
      ) : mounts.length === 0 ? (
        <Text className={styles.emptyText}>No validator filesystems</Text>
      ) : (
        mounts.map((mount) => {
          const summary = getDiskSummary(mount);
          const segments = [
            ...summary.firedancerSegments,
            {
              key: "other",
              label: "Other",
              bytes: summary.nonFiredancerBytes,
              color: resourceColors.other,
            },
            {
              key: "free",
              label: "Free",
              bytes: summary.freeBytes,
              color: resourceColors.available,
            },
          ].filter((segment) => segment.bytes > 0);

          return (
            <Flex key={mount.name} direction="column" gap="2" minWidth="0">
              <div className={styles.numaSubhead}>
                <Flex align="center" gap="10px" wrap="wrap" minWidth="0">
                  <Tooltip
                    className={styles.resourceTooltip}
                    content={mount.name}
                  >
                    <Text className={styles.mountName}>{mount.name}</Text>
                  </Tooltip>
                  {segments.map((segment) => (
                    <LegendItem
                      key={segment.key}
                      label={segment.label}
                      value={formatSIBytesStr(segment.bytes)}
                      color={segment.color}
                      swatchClassName={styles.legendBar}
                    />
                  ))}
                </Flex>
                <Text className={styles.sectionValue}>
                  {formatSIBytesStr(summary.totalBytes)}
                </Text>
              </div>
              <SegmentedBar
                segments={segments}
                total={summary.totalBytes}
                ariaLabel={`${mount.name} disk usage`}
              />
            </Flex>
          );
        })
      )}
    </Flex>
  );
}
