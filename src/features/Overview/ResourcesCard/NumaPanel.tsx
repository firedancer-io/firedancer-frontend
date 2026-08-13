import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Flex, Text, Tooltip } from "@radix-ui/themes";
import clsx from "clsx";
import type { SystemLive, Tile } from "../../../api/types";
import { formatSIBytesStr } from "../../../utils";
import SegmentedBar from "./SegmentedBar";
import LegendItem from "./LegendItem";
import {
  getTileColor,
  resourceColors,
  type NumaNode,
  type ResourceSegment,
} from "./utils";
import styles from "./resourcesCard.module.css";

/**
 * Sentinel `tileIdx` for the shared-memory segment. Shared memory isn't owned by
 * a core, so it participates in bar/legend highlighting but never lights up the
 * CPU grid.
 */
const SHARED_IDX = -1;

interface NumaPanelProps {
  node: NumaNode;
  cpus: SystemLive["cpus"];
  tiles?: Tile[];
}

export default function NumaPanel({ node, cpus, tiles }: NumaPanelProps) {
  const [hoveredTileIdxs, setHoveredTileIdxs] = useState<number[]>([]);
  const [pinnedTileIdxs, setPinnedTileIdxs] = useState<number[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Hover previews transiently; a click pins the selection until the user
  // clicks another tile or clicks away.
  const activeTileIdxs = hoveredTileIdxs.length
    ? hoveredTileIdxs
    : pinnedTileIdxs;

  const handleSelect = useCallback((tileIdxs: number[]) => {
    setPinnedTileIdxs((prev) => (sameTileSet(prev, tileIdxs) ? [] : tileIdxs));
  }, []);

  // Clear the pin when the user clicks anything that isn't an interactive tile
  // element inside this panel (empty space, another card, another panel).
  useEffect(() => {
    if (!pinnedTileIdxs.length) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const interactive = (e.target as HTMLElement).closest(
        `[data-tile-interactive]`,
      );
      if (!interactive || !panelRef.current?.contains(interactive)) {
        setPinnedTileIdxs([]);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [pinnedTileIdxs]);

  const tileLabel = useCallback(
    (tileIdx: number) => {
      const tile = tiles?.[tileIdx];
      return tile ? `${tile.kind}:${tile.kind_id}` : `Tile ${tileIdx}`;
    },
    [tiles],
  );

  return (
    <div className={styles.numaPanel} ref={panelRef}>
      <Text className={styles.numaLabel}>NUMA {node.node}</Text>
      <div className={styles.numaBody}>
        <CpuGrid
          node={node}
          cpus={cpus}
          tileLabel={tileLabel}
          activeTileIdxs={activeTileIdxs}
          onHover={setHoveredTileIdxs}
          onSelect={handleSelect}
        />
        <MemorySection
          node={node}
          tileLabel={tileLabel}
          activeTileIdxs={activeTileIdxs}
          onHover={setHoveredTileIdxs}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}

function sameTileSet(a: number[], b: number[]) {
  return a.length === b.length && a.every((idx) => b.includes(idx));
}

interface SectionProps {
  node: NumaNode;
  tileLabel: (tileIdx: number) => string;
  activeTileIdxs: number[];
  onHover: (tileIdxs: number[]) => void;
  onSelect: (tileIdxs: number[]) => void;
}

function CpuGrid({
  node,
  cpus,
  tileLabel,
  activeTileIdxs,
  onHover,
  onSelect,
}: SectionProps & { cpus: SystemLive["cpus"] }) {
  const hasActive = activeTileIdxs.some((idx) => idx !== SHARED_IDX);

  return (
    <Flex direction="column" gap="2" minWidth="0">
      <Text className={styles.subLabel}>CPU</Text>
      <div
        className={styles.cpuGrid}
        aria-label={`${node.pinned} of ${node.totalCpus} logical CPUs pinned on NUMA ${node.node}`}
      >
        {node.cpuGroups.map((group) => {
          const halves = group.map((cpuIdx) => {
            const cpu = cpus[cpuIdx];
            const status = getCpuStatus(cpu);
            const labels = cpu.tile_idxs.map((tileIdx) => tileLabel(tileIdx));
            const isActive = cpu.tile_idxs.some((idx) =>
              activeTileIdxs.includes(idx),
            );
            return { cpuIdx, cpu, status, labels, isActive };
          });
          const groupActive = halves.some((half) => half.isActive);
          const groupTileIdxs = halves.flatMap(({ cpu }) => cpu.tile_idxs);

          return (
            <Tooltip
              key={group.join("-")}
              content={
                <Flex direction="column" gap="2">
                  {halves.map(({ cpuIdx, cpu, status, labels }) => (
                    <Flex key={cpuIdx} direction="column" gap="1">
                      <Text weight="bold">Logical CPU {cpuIdx}</Text>
                      <Text>{status}</Text>
                      {labels.length > 0 && (
                        <Text>Tiles: {labels.join(", ")}</Text>
                      )}
                    </Flex>
                  ))}
                </Flex>
              }
            >
              {/* Hover handlers live on the same element as the tooltip trigger
                  so the tooltip and the tile highlight fire in sync. */}
              <div
                className={clsx(styles.cpu, {
                  [styles.cpuHighlight]: groupActive,
                  [styles.cpuDimmed]: hasActive && !groupActive,
                  [styles.cpuInteractive]: groupTileIdxs.length > 0,
                })}
                data-tile-interactive={
                  groupTileIdxs.length > 0 ? "" : undefined
                }
                aria-label={halves
                  .map(({ cpuIdx, status }) => `CPU ${cpuIdx}: ${status}`)
                  .join(", ")}
                onMouseEnter={
                  groupTileIdxs.length > 0
                    ? () => onHover(groupTileIdxs)
                    : undefined
                }
                onMouseLeave={
                  groupTileIdxs.length > 0 ? () => onHover([]) : undefined
                }
                onClick={
                  groupTileIdxs.length > 0
                    ? () => onSelect(groupTileIdxs)
                    : undefined
                }
              >
                {halves.map(({ cpuIdx, cpu, isActive }) => (
                  <div
                    key={cpuIdx}
                    className={clsx(styles.cpuHalf, {
                      [styles.cpuPinned]:
                        cpu.online && cpu.tile_idxs.length > 0,
                      [styles.cpuOffline]: !cpu.online,
                    })}
                    style={
                      isActive ? cpuTileColorStyle(cpu.tile_idxs) : undefined
                    }
                  />
                ))}
                {halves.length === 1 && <div className={styles.cpuHalf} />}
              </div>
            </Tooltip>
          );
        })}
      </div>
      <Flex gap="10px" wrap="wrap">
        <LegendItem
          label="Pinned"
          value={node.pinned}
          swatchClassName={clsx(styles.cpuKeySwatch, styles.cpuPinned)}
          tooltip="Logical CPUs running a Firedancer tile"
        />
        <LegendItem
          label="Unpinned"
          value={node.unpinned}
          swatchClassName={styles.cpuKeySwatch}
          tooltip="Online CPUs with no tile assigned"
        />
        <LegendItem
          label="Offline"
          value={node.offline}
          swatchClassName={clsx(styles.cpuKeySwatch, styles.cpuOffline)}
          tooltip="CPUs that were offline at validator startup"
        />
        <LegendItem
          label="Total"
          value={node.totalCpus}
          tooltip="All logical CPUs on this NUMA node"
        />
      </Flex>
    </Flex>
  );
}

function MemorySection({
  node,
  tileLabel,
  activeTileIdxs,
  onHover,
  onSelect,
}: SectionProps) {
  const memory = node.memory;

  if (!memory) {
    return (
      <Flex direction="column" gap="2" minWidth="0">
        <Text className={styles.subLabel}>Memory</Text>
        <div className={styles.segmentedBar} />
      </Flex>
    );
  }

  // Overview bar: Firedancer as one block, against total host memory.
  const overviewSegments: ResourceSegment[] = [
    {
      key: "firedancer",
      label: "Firedancer",
      bytes: memory.firedancerBytes,
      color: resourceColors.firedancer,
    },
    {
      key: "other",
      label: "Non-Firedancer",
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

  // Breakdown bar: individual tiles + shared, scaled to the Firedancer total so
  // the tile slices fill the width and stay readable.
  const tileSegments: ResourceSegment[] = memory.tiles.map((tile) => ({
    key: `tile-${tile.tileIdx}`,
    label: tileLabel(tile.tileIdx),
    bytes: tile.bytes,
    color: getTileColor(tile.tileIdx),
    tileIdx: tile.tileIdx,
  }));
  const breakdownSegments: ResourceSegment[] = [
    ...tileSegments,
    {
      key: "shared",
      label: "Shared",
      bytes: memory.sharedBytes,
      color: resourceColors.shared,
      tileIdx: SHARED_IDX,
    },
  ].filter((segment) => segment.bytes > 0);

  const hasActive = activeTileIdxs.length > 0;

  return (
    <Flex direction="column" gap="3" minWidth="0">
      <Flex direction="column" gap="2" minWidth="0">
        <Text className={styles.subLabel}>Memory</Text>
        <SegmentedBar
          total={memory.totalBytes}
          ariaLabel={`NUMA ${node.node} memory usage: ${formatSIBytesStr(
            memory.usedBytes,
          )} of ${formatSIBytesStr(memory.totalBytes)}`}
          segments={overviewSegments}
        />
        <Flex gap="10px" wrap="wrap">
          {overviewSegments.map((segment) => (
            <LegendItem
              key={segment.key}
              label={segment.label}
              value={formatSIBytesStr(segment.bytes)}
              color={segment.color}
            />
          ))}
          <LegendItem
            label="Total"
            value={formatSIBytesStr(memory.totalBytes)}
          />
        </Flex>
      </Flex>
      <Flex direction="column" gap="2" minWidth="0">
        <Text className={styles.subLabel}>Firedancer memory by tile</Text>
        <SegmentedBar
          total={memory.firedancerBytes}
          ariaLabel={`NUMA ${node.node} Firedancer memory by tile`}
          activeTileIdxs={activeTileIdxs}
          onHover={onHover}
          onSelect={onSelect}
          segments={breakdownSegments}
        />
        <ul className={styles.memoryLegend} onMouseLeave={() => onHover([])}>
          {breakdownSegments.map((segment) => {
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
                  isTile
                    ? () => onSelect([segment.tileIdx as number])
                    : undefined
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
    </Flex>
  );
}

function getCpuStatus(cpu: SystemLive["cpus"][number]) {
  if (!cpu.online) return "Offline";
  return cpu.tile_idxs.length > 0 ? "Pinned" : "Unpinned";
}

/**
 * Fills a highlighted CPU half with its tile color, or hard-edged bands of every
 * tile's color when multiple tiles share the CPU.
 */
function cpuTileColorStyle(tileIdxs: number[]): CSSProperties | undefined {
  if (tileIdxs.length === 0) return undefined;
  if (tileIdxs.length === 1) {
    return { background: getTileColor(tileIdxs[0]) };
  }
  const step = 100 / tileIdxs.length;
  const bands = tileIdxs
    .map((tileIdx, i) => {
      const color = getTileColor(tileIdx);
      return `${color} ${i * step}%, ${color} ${(i + 1) * step}%`;
    })
    .join(", ");
  return { background: `linear-gradient(180deg, ${bands})` };
}
