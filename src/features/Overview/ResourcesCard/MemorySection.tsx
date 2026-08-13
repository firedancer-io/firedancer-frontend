import { Flex, Text, Tooltip } from "@radix-ui/themes";
import type { SystemLive, Tile } from "../../../api/types";
import { formatSIBytesStr } from "../../../utils";
import SegmentedBar from "./SegmentedBar";
import { formatResourceUsage, getMemorySummary, resourceColors } from "./utils";
import styles from "./resourcesCard.module.css";

export default function MemorySection({
  memory,
  tiles,
}: {
  memory?: SystemLive["memory"];
  tiles?: Tile[];
}) {
  if (!memory) return <EmptySection label="Memory" />;

  const summary = getMemorySummary(memory);
  const value = formatResourceUsage(
    summary.firedancerBytes,
    summary.usedBytes,
    summary.totalBytes,
  );
  const tileSegments = summary.tiles.map((tile) => {
    const tileInfo = tiles?.[tile.tileIdx];
    const label = tileInfo
      ? `${tileInfo.kind} ${tileInfo.kind_id}`
      : `Tile ${tile.tileIdx}`;
    return {
      key: `tile-${tile.tileIdx}`,
      label,
      bytes: tile.bytes,
      color: getTileColor(tile.tileIdx),
    };
  });

  return (
    <Flex direction="column" gap="2" minWidth="0">
      <SectionHeading label="Memory" value={value} />
      <SegmentedBar
        total={summary.totalBytes}
        ariaLabel={`Memory usage: ${value}`}
        segments={[
          ...tileSegments,
          {
            key: "shared",
            label: "Firedancer shared",
            bytes: summary.sharedBytes,
            color: resourceColors.firedancer,
          },
          {
            key: "other",
            label: "Other",
            bytes: summary.otherBytes,
            color: resourceColors.other,
          },
          {
            key: "available",
            label: "Available",
            bytes: summary.availableBytes,
            color: resourceColors.available,
          },
        ]}
      />
      {summary.nodes.length > 1 && (
        <Flex gap="3" wrap="wrap" className={styles.detailRow}>
          {summary.nodes.map((node) => (
            <Tooltip
              key={node.node}
              content="Resident Firedancer user-space memory on this NUMA node"
            >
              <Text>
                NUMA {node.node}: {formatSIBytesStr(node.bytes)}
              </Text>
            </Tooltip>
          ))}
        </Flex>
      )}
    </Flex>
  );
}

function getTileColor(tileIdx: number) {
  const hue = (tileIdx * 47 + 190) % 360;
  return `hsl(${hue} 48% 45%)`;
}

export function SectionHeading({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Flex justify="between" align="baseline" gap="3">
      <Text className={styles.sectionLabel}>{label}</Text>
      <Text className={styles.sectionValue}>{value}</Text>
    </Flex>
  );
}

function EmptySection({ label }: { label: string }) {
  return (
    <Flex direction="column" gap="2">
      <SectionHeading label={label} value="—" />
      <div className={styles.segmentedBar} />
    </Flex>
  );
}
