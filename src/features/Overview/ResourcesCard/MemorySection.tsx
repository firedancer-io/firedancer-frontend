import { useState } from "react";
import { sortBy, sumBy } from "lodash";
import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { liveSystemResourcesAtom, tilesAtom } from "../../../api/atoms";
import type { SystemLive } from "../../../api/types";
import { formatSIBytesStr } from "../../../utils";
import { SectionHeading } from "./Headings";
import { LegendItem, LegendSubHeading, SegmentedBar } from "./Legend";
import { TooltipBody, TooltipRow } from "./ResourceTooltip";
import {
  resourcesFiredancerColor,
  resourcesMoreTilesColor,
  resourcesSharedColor,
} from "../../../colors";
import { getTileLabel, getUsageSegments, type ResourceSegment } from "./utils";

const tileColors = [
  "#557AE0",
  "#9982F0",
  "#67B873",
  "#B2904D",
  "#A66759",
  "#118B74",
] as const;

const NUM_INDIVIDUAL_TILES = tileColors.length;
const N_MORE_TILES_KEY = "n-more-tiles";

type NumaNode = SystemLive["memory"]["nodes"][number] & {
  firedancerBytes: number;
  otherBytes: number;
};

export default function MemorySection() {
  const memory = useAtomValue(liveSystemResourcesAtom)?.memory;
  if (!memory?.nodes.length) return null;

  const nodes = getNumaNodes(memory);
  const totalBytes = sumBy(nodes, (node) => node.total_bytes);

  return (
    <Flex direction="column" gap="10px" minWidth="0">
      <SectionHeading label="Memory" value={formatSIBytesStr(totalBytes)} />
      {nodes.map((node) => (
        <NodeMemory key={node.node} node={node} />
      ))}
    </Flex>
  );
}

interface NodeMemoryProps {
  node: NumaNode;
}

function NodeMemory({ node }: NodeMemoryProps) {
  const tiles = useAtomValue(tilesAtom);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const overviewSegments = getUsageSegments(
    [
      {
        key: "firedancer",
        label: "Firedancer",
        bytes: node.firedancerBytes,
        color: resourcesFiredancerColor,
      },
    ],
    node.otherBytes,
    node.free_bytes,
  );

  const tileSegments: ResourceSegment[] = node.tiles
    .filter((tile) => tile.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .map((tile, rank) => ({
      key: `tile-${tile.tile_idx}`,
      label: getTileLabel(tiles, tile.tile_idx),
      bytes: tile.bytes,
      color: getTileColor(rank),
    }));

  const sharedSegment: ResourceSegment = {
    key: "shared",
    label: "Shared",
    bytes: node.shared_bytes,
    color: resourcesSharedColor,
  };

  // If there are more than NUM_INDIVIDUAL_TILES + 1 tiles, the smallest tiles
  // collapse into one "N more tiles" segment
  const numShown =
    tileSegments.length > NUM_INDIVIDUAL_TILES + 1
      ? NUM_INDIVIDUAL_TILES
      : tileSegments.length;
  const collapsedTiles = tileSegments.slice(numShown);

  const allSegments: ResourceSegment[] = [
    ...tileSegments.slice(0, numShown),
    ...(collapsedTiles.length > 0
      ? [
          {
            key: N_MORE_TILES_KEY,
            label: `${collapsedTiles.length} more tiles`,
            bytes: sumBy(collapsedTiles, (tile) => tile.bytes),
            color: resourcesMoreTilesColor,
          },
        ]
      : []),
    ...(node.shared_bytes > 0 ? [sharedSegment] : []),
  ];

  return (
    <LegendSubHeading
      label={`NUMA ${node.node}`}
      segments={overviewSegments}
      total={node.total_bytes}
    >
      <SegmentedBar
        height="6px"
        total={node.firedancerBytes}
        activeKey={activeKey}
        onHover={(segment) => setActiveKey(segment?.key ?? null)}
        segments={allSegments}
      />
      <Flex wrap="wrap" gapX="10px" gapY="2px" minWidth="0">
        {allSegments.map((segment) => (
          <LegendItem
            key={segment.key}
            gap="8px"
            label={segment.label}
            value={formatSIBytesStr(segment.bytes)}
            color={segment.color}
            tooltip={
              segment.key === N_MORE_TILES_KEY ? (
                <TooltipBody scrollable>
                  {collapsedTiles.map((tile) => (
                    <TooltipRow
                      key={tile.key}
                      label={tile.label}
                      value={formatSIBytesStr(tile.bytes)}
                    />
                  ))}
                </TooltipBody>
              ) : undefined
            }
            itemKey={segment.key}
            activeKey={activeKey}
            onMouseEnter={() => setActiveKey(segment.key)}
            onMouseLeave={() => setActiveKey(null)}
          />
        ))}
      </Flex>
    </LegendSubHeading>
  );
}

function getTileColor(rank: number) {
  return tileColors[rank] ?? resourcesMoreTilesColor;
}

function getNumaNodes(memory: SystemLive["memory"]): NumaNode[] {
  return sortBy(memory.nodes, (node) => node.node).map((node) => {
    const usedBytes = node.total_bytes - node.free_bytes;
    const firedancerBytes =
      node.shared_bytes + sumBy(node.tiles, (tile) => tile.bytes);

    return {
      ...node,
      firedancerBytes,
      otherBytes: Math.max(0, usedBytes - firedancerBytes),
    };
  });
}
