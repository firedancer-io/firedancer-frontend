/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { useCallback, useMemo } from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { GossipNetworkTraffic } from "../../api/types";
import { hierarchy, Treemap, treemapSquarify } from "@visx/hierarchy";
import { Group } from "@visx/group";

import { scaleOrdinal } from "d3-scale";
import type { HierarchyRectangularNode } from "@visx/hierarchy/lib/types";
import { useAtomValue } from "jotai";
import { peersAtom } from "../../atoms";
import { formatNumberLamports } from "../Overview/ValidatorsCard/formatAmt";
import { sum } from "lodash";
import AutoSizer from "react-virtualized-auto-sizer";
import { headerGap } from "./consts";
import styles from "./trafficTreeMap.module.css";
import { formatBytesAsBits } from "../../utils";
import { measureTextWidth } from "../../measureUtils";

interface TrafficeNetworkChartProps {
  networkTraffic: GossipNetworkTraffic;
  label: string;
}

type GetPeerValues = (
  id: string,
) => { stake?: string; name?: string; iconUrl?: string } | undefined;

export function TrafficTreeMap({
  networkTraffic,
  label,
}: TrafficeNetworkChartProps) {
  const peers = useAtomValue(peersAtom);

  const data = useMemo(() => {
    const threshold = 0.7;
    let currentTotal = 0;
    let i = 0;
    const children: TrafficNode[] = [];
    while (
      i < networkTraffic.peer_throughput.length &&
      currentTotal * threshold < (networkTraffic.total_throughput ?? 0)
    ) {
      children.push({
        id: networkTraffic.peer_identities[i],
        value: networkTraffic.peer_throughput[i],
      });
      currentTotal += networkTraffic.peer_throughput[i];
      i++;
    }

    let restOfThroughput = 0;
    for (i; i < networkTraffic.peer_throughput.length; i++) {
      restOfThroughput += networkTraffic.peer_throughput[i];
    }

    children.push({
      id: "rest",
      value: restOfThroughput,
    });

    return {
      id: "peers",
      children,
      value: currentTotal + restOfThroughput,
    };
  }, [networkTraffic]);

  const getPeerValues = useCallback<GetPeerValues>(
    (id: string) => {
      const peer = peers[id];
      if (!peer) return;

      const stakeValue = sum(
        peer.vote.map((v) => (v.delinquent ? 0 : Number(v.activated_stake))),
      );

      const stake = stakeValue
        ? `${formatNumberLamports(stakeValue)} SOL`
        : undefined;
      const iconUrl =
        peer.info?.icon_url ||
        (peer.info?.keybase_username
          ? `https://keybase.io/${peer.info.keybase_username}/picture`
          : undefined) ||
        undefined;

      const name = peer.info?.name ?? undefined;

      return { stake, iconUrl, name };
    },
    [peers],
  );

  if (!data) return;

  const formattedThroughput = formatBytesAsBits(
    networkTraffic.total_throughput,
  );

  return (
    <Flex
      direction="column"
      gap={headerGap}
      minHeight="300px"
      minWidth="300px"
      flexGrow="1"
    >
      <Flex justify="between">
        <Text className={styles.headerText}>{label}</Text>

        <span>
          <Text className={styles.totalText}>Total</Text>
          <Text className={styles.throughputText}>
            &nbsp;{`${formattedThroughput.value} ${formattedThroughput.unit}`}/s
          </Text>
        </span>
      </Flex>
      <Box flexGrow="1">
        <AutoSizer>
          {({ height, width }) => (
            <TreemapTwoLevel
              data={data}
              width={width}
              height={height}
              getPeerValues={getPeerValues}
            />
          )}
        </AutoSizer>
      </Box>
    </Flex>
  );
}

interface TrafficNode {
  id: string;
  value: number;
  children?: TrafficNode[];
}

function truncateToWidth(text: string, font: string, maxWidth: number) {
  const w = measureTextWidth(text, font);
  if (w <= maxWidth) return text;
  const ellipsis = "…";
  const ellW = measureTextWidth(ellipsis, font);
  if (ellW > maxWidth) return ""; // no space even for ellipsis
  // Binary search for max chars that fit with ellipsis
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    const cw = measureTextWidth(candidate, font);
    if (cw <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

type Props = {
  data: TrafficNode & { children: TrafficNode[] };
  width: number;
  height: number;
  getPeerValues: GetPeerValues;
};

const minLabelWidth = 55;
const minLabelHeight = 40;
const labelPadding = 8;
const lineGap = 2;

const colors = [
  "#48295C",
  "#562800",
  "#132D21",
  "#331E0B",
  "#0D2847",
  "#292929",
];

// Increase ratio to bias more width; decrease toward 1.0 for more square
const squarifyTile = treemapSquarify.ratio(1.1);

export default function TreemapTwoLevel({
  data,
  width,
  height,
  getPeerValues,
}: Props) {
  // use sorted children to help squarify produce nicer aspect ratios
  const root = useMemo(() => hierarchy<TrafficNode>(data), [data]);

  // Color scale per leaf id
  const getColor = useMemo(
    () =>
      scaleOrdinal<string, string>()
        .domain(data.children.map((c) => c.id))
        .range(colors),
    [data],
  );

  return (
    <svg width={width} height={height}>
      <Treemap
        root={root}
        size={[width, height]}
        tile={squarifyTile}
        round
        paddingInner={2}
      >
        {(treemap) =>
          treemap.leaves().map((leaf) => {
            const x = leaf.x0;
            const y = leaf.y0;
            const rectWidth = leaf.x1 - leaf.x0;
            const rectHeight = leaf.y1 - leaf.y0;
            const id = leaf.data.id;

            return (
              <Group key={id}>
                <rect
                  x={x}
                  y={y}
                  width={rectWidth}
                  height={rectHeight}
                  rx={1}
                  ry={1}
                  fill={getColor(id)}
                />
                <NodeText
                  leaf={leaf}
                  total={data.value}
                  getPeerValues={getPeerValues}
                />
              </Group>
            );
          })
        }
      </Treemap>
    </svg>
  );
}

interface NodeTextProps {
  leaf: HierarchyRectangularNode<any>;
  total: number;
  getPeerValues: GetPeerValues;
}

function NodeText({ leaf, total, getPeerValues }: NodeTextProps) {
  const x = leaf.x0;
  const y = leaf.y0;
  const rectWidth = leaf.x1 - leaf.x0;
  const rectHeight = leaf.y1 - leaf.y0;

  const id = String(leaf.data.id);
  const pct = total > 0 ? (100 * (leaf.value || 0)) / total : 0;

  const showLabel = rectWidth >= minLabelWidth && rectHeight >= minLabelHeight;
  const showThirdLine = rectHeight > 30 * 2;
  // TODO: take out this scaling probably
  const fontSize = Math.max(11, Math.min(16, Math.floor(rectWidth / 12)));
  const peerValues = getPeerValues(id);
  const idFont = `${fontSize}px Inter Tight`;

  const centerX = x + rectWidth / 2;
  const lineDy = fontSize + lineGap;
  const textY = y + rectHeight / 3;

  const iconGap = 2;
  const iconSize = fontSize + 4;
  const availableWidth = Math.max(
    0,
    rectWidth - 2 * labelPadding - (iconSize ? iconSize + iconGap : 0),
  );
  const idText = truncateToWidth(
    peerValues?.name ?? id,
    idFont,
    availableWidth,
  );

  // const firstLineTop = y + labelPadding;
  const firstBaselineY = textY; // firstLineTop + idFontSize;
  // const iconY = textY; // firstLineTop + Math.max(0, (idFontSize - iconSize) / 2);

  const formatted = formatBytesAsBits(leaf.value ?? 0);
  let throughputLine = `${formatted ? `${formatted.value} ${formatted.unit} ` : ""}(${pct.toFixed(1)}%)`;

  const showPct = measureTextWidth(throughputLine, idFont) < availableWidth;
  if (!showPct) {
    throughputLine = `${formatted.value} ${formatted.unit}`;
  }

  if (rectWidth < minLabelWidth) return;

  return (
    <>
      <text
        x={centerX}
        y={firstBaselineY}
        fontSize={fontSize}
        fontFamily="Inter Tight"
        fontWeight={600}
        fill="#CCCCCC"
        alignmentBaseline="text-before-edge"
        textAnchor="middle"
        pointerEvents="none"
      >
        {idText}
      </text>
      {showLabel && (
        <text
          x={centerX}
          y={firstBaselineY + 12}
          fontSize={fontSize}
          fontFamily="Inter Tight"
          fill="#CCCCCC"
          pointerEvents="none"
          alignmentBaseline="text-before-edge"
          textAnchor="middle"
        >
          <tspan x={centerX} dy={lineDy} fill="#8A8A8A">
            {throughputLine}
          </tspan>
          {showThirdLine && (
            <tspan x={centerX} dy={lineDy} fill="#8A8A8A">
              {peerValues?.stake}
            </tspan>
          )}
        </text>
      )}
    </>
  );
}
