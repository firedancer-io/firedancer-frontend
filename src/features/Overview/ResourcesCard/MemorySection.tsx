import { useCallback, useEffect, useRef, useState } from "react";
import { Flex, Text } from "@radix-ui/themes";
import clsx from "clsx";
import type { SystemLive, Tile } from "../../../api/types";
import { formatSIBytesStr } from "../../../utils";
import SectionHeading from "./SectionHeading";
import SegmentedBar from "./SegmentedBar";
import LegendItem from "./LegendItem";
import {
  getNumaNodes,
  getTileColor,
  resourceColors,
  summarizeTileSegments,
  type NumaNodeMemory,
  type ResourceSegment,
} from "./utils";
import styles from "./resourcesCard.module.css";

/** Sentinel tileIdx for the shared-memory segment (not owned by any tile). */
const SHARED_IDX = -1;
/** Individual tiles shown in the breakdown legend before collapsing the rest. */
const TOP_TILES = 6;

export default function MemorySection({
  memory,
  tiles,
}: {
  memory?: SystemLive["memory"];
  tiles?: Tile[];
}) {
  const [hoveredTileIdxs, setHoveredTileIdxs] = useState<number[]>([]);
  const [pinnedTileIdxs, setPinnedTileIdxs] = useState<number[]>([]);
  const sectionRef = useRef<HTMLDivElement>(null);

  const activeTileIdxs = hoveredTileIdxs.length
    ? hoveredTileIdxs
    : pinnedTileIdxs;

  const handleSelect = useCallback((tileIdxs: number[]) => {
    setPinnedTileIdxs((prev) => (sameTileSet(prev, tileIdxs) ? [] : tileIdxs));
  }, []);

  useEffect(() => {
    if (!pinnedTileIdxs.length) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const interactive = (e.target as HTMLElement).closest(
        `[data-tile-interactive]`,
      );
      if (!interactive || !sectionRef.current?.contains(interactive)) {
        setPinnedTileIdxs([]);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [pinnedTileIdxs]);

  const tileLabel = useCallback(
    (tileIdx: number) => {
      const tile = tiles?.[tileIdx];
      return tile ? `${tile.kind}.${tile.kind_id}` : `tile ${tileIdx}`;
    },
    [tiles],
  );

  const nodes = getNumaNodes(undefined, memory);
  const hostTotal = nodes.reduce(
    (sum, node) => sum + (node.memory?.totalBytes ?? 0),
    0,
  );

  return (
    <Flex direction="column" gap="3" minWidth="0" ref={sectionRef}>
      <SectionHeading label="Memory" value={formatSIBytesStr(hostTotal)} />
      {nodes.length === 0 ? (
        <div className={styles.segmentedBar} />
      ) : (
        nodes.map((node) =>
          node.memory ? (
            <NodeMemory
              key={node.node}
              nodeId={node.node}
              memory={node.memory}
              tileLabel={tileLabel}
              activeTileIdxs={activeTileIdxs}
              onHover={setHoveredTileIdxs}
              onSelect={handleSelect}
            />
          ) : null,
        )
      )}
    </Flex>
  );
}

function sameTileSet(a: number[], b: number[]) {
  return a.length === b.length && a.every((idx) => b.includes(idx));
}

interface NodeMemoryProps {
  nodeId: number;
  memory: NumaNodeMemory;
  tileLabel: (tileIdx: number) => string;
  activeTileIdxs: number[];
  onHover: (tileIdxs: number[]) => void;
  onSelect: (tileIdxs: number[]) => void;
}

function NodeMemory({
  nodeId,
  memory,
  tileLabel,
  activeTileIdxs,
  onHover,
  onSelect,
}: NodeMemoryProps) {
  const overviewSegments: ResourceSegment[] = [
    {
      key: "firedancer",
      label: "Firedancer",
      bytes: memory.firedancerBytes,
      color: resourceColors.firedancer,
    },
    {
      key: "other",
      label: "Other",
      bytes: memory.otherBytes,
      color: resourceColors.other,
    },
    {
      key: "free",
      label: "Free",
      bytes: memory.freeBytes,
      color: resourceColors.available,
    },
  ].filter((segment) => segment.bytes > 0);

  // Breakdown bar keeps every tile (so cross-highlighting stays precise); the
  // legend below collapses the long tail into one "N more tiles" row.
  const tileSegments: ResourceSegment[] = memory.tiles
    .map((tile) => ({
      key: `tile-${tile.tileIdx}`,
      label: tileLabel(tile.tileIdx),
      bytes: tile.bytes,
      color: getTileColor(tile.tileIdx),
      tileIdx: tile.tileIdx,
    }))
    .filter((segment) => segment.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);

  const sharedSegment: ResourceSegment = {
    key: "shared",
    label: "Shared",
    bytes: memory.sharedBytes,
    color: resourceColors.shared,
    tileIdx: SHARED_IDX,
  };

  // Tiles past the top N fall into the "N more tiles" bucket, so their bar
  // segments take the same gray as that aggregate legend row.
  const breakdownTileSegments = tileSegments.map((segment, i) =>
    i < TOP_TILES ? segment : { ...segment, color: resourceColors.other },
  );

  const breakdownSegments = [
    ...breakdownTileSegments,
    ...(memory.sharedBytes > 0 ? [sharedSegment] : []),
  ];
  const legendSegments = [
    ...summarizeTileSegments(tileSegments, TOP_TILES),
    ...(memory.sharedBytes > 0 ? [sharedSegment] : []),
  ];

  const hasActive = activeTileIdxs.length > 0;

  return (
    <Flex direction="column" gap="2" minWidth="0">
      <div className={styles.numaSubhead}>
        <Flex align="center" gap="10px" wrap="wrap" minWidth="0">
          <Text className={styles.numaLabel}>NUMA {nodeId}</Text>
          <LegendItem
            label="Firedancer"
            value={formatSIBytesStr(memory.firedancerBytes)}
            color={resourceColors.firedancer}
            swatchClassName={styles.legendBar}
          />
          <LegendItem
            label="Other"
            value={formatSIBytesStr(memory.otherBytes)}
            color={resourceColors.other}
            swatchClassName={styles.legendBar}
          />
          <LegendItem
            label="Free"
            value={formatSIBytesStr(memory.freeBytes)}
            color={resourceColors.available}
            swatchClassName={styles.legendBar}
          />
        </Flex>
        <Text className={styles.sectionValue}>
          {formatSIBytesStr(memory.totalBytes)}
        </Text>
      </div>
      <SegmentedBar
        total={memory.totalBytes}
        ariaLabel={`NUMA ${nodeId} memory usage: ${formatSIBytesStr(
          memory.usedBytes,
        )} of ${formatSIBytesStr(memory.totalBytes)}`}
        segments={overviewSegments}
      />
      <SegmentedBar
        className={styles.barBreakdown}
        total={memory.firedancerBytes}
        ariaLabel={`NUMA ${nodeId} Firedancer memory by tile`}
        activeTileIdxs={activeTileIdxs}
        onHover={onHover}
        onSelect={onSelect}
        segments={breakdownSegments}
      />
      <ul className={styles.memoryLegend} onMouseLeave={() => onHover([])}>
        {legendSegments.map((segment) => {
          const isTile = segment.tileIdx != null;
          const isActive =
            isTile && activeTileIdxs.includes(segment.tileIdx as number);
          return (
            <li
              key={segment.key}
              className={clsx(styles.legendRow, {
                [styles.legendRowActive]: isActive,
                [styles.legendRowDimmed]: hasActive && isTile && !isActive,
                [styles.legendRowInteractive]: isTile,
              })}
              data-tile-interactive={isTile ? "" : undefined}
              onMouseEnter={() =>
                onHover(segment.tileIdx != null ? [segment.tileIdx] : [])
              }
              onClick={
                isTile ? () => onSelect([segment.tileIdx as number]) : undefined
              }
            >
              <span
                className={styles.legendSwatch}
                style={{ background: segment.color }}
              />
              <span className={styles.legendLabel}>{segment.label}</span>
              <span className={styles.legendValue}>
                {formatSIBytesStr(segment.bytes)}
              </span>
            </li>
          );
        })}
      </ul>
    </Flex>
  );
}
