import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Box, Flex, Text, Tooltip } from "@radix-ui/themes";
import type { GossipNetworkTraffic } from "../../api/types";
import { treemap, hierarchy, treemapSquarify } from "d3-hierarchy";
import type { HierarchyRectangularNode } from "d3-hierarchy";
import { useAtomValue } from "jotai";
import { epochStakesAtom, peersAtom, totalNetworkStakeAtom } from "../../atoms";
import { shuffle } from "lodash";
import AutoSizer from "react-virtualized-auto-sizer";
import { headerGap } from "./consts";
import styles from "./trafficTreeMap.module.css";
import {
  copyToClipboard,
  formatBytesAsBits,
  getPeerIconUrl,
  getEpochStake,
  getFmtStake,
} from "../../utils";
import PeerIcon from "../../components/PeerIcon";
import { PieChartIcon } from "@radix-ui/react-icons";

import clsx from "clsx";
import { useUnmount } from "react-use";
import { needsTouchScreenSupport } from "../../consts";

const colors = [
  "#202248",
  "#203246",
  "#204346",
  "#204634",
  "#344620",
  "#464420",
  "#463220",
  "#462020",
  "#46203F",
  "#3A2046",
];

// Increase ratio to bias more width; decrease toward 1.0 for more square
const squarifyTile = treemapSquarify.ratio(1.2);

interface TrafficNode {
  id: string;
  value?: number;
  children?: TrafficNode[];
}

type GetPeerValues = (id: string) => {
  stake?: bigint;
  name?: string;
  iconUrl?: string;
};

interface TrafficTreeMapProps {
  networkTraffic: GossipNetworkTraffic;
  label: string;
}

export function TrafficTreeMap({ networkTraffic, label }: TrafficTreeMapProps) {
  const peers = useAtomValue(peersAtom);
  const epochStakes = useAtomValue(epochStakesAtom);

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
    };
  }, [networkTraffic]);

  const getPeerValues = useCallback<GetPeerValues>(
    (id: string) => {
      const peer = peers[id];
      const stake = id === "rest" ? undefined : getEpochStake(epochStakes, id);
      const iconUrl = getPeerIconUrl(peer?.info);
      const name =
        id === "rest" ? "Other peers" : (peer?.info?.name ?? undefined);

      return { stake, iconUrl, name };
    },
    [peers, epochStakes],
  );

  const totalNetworkStake = useAtomValue(totalNetworkStakeAtom);

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
              sortedData={data}
              width={width}
              height={height}
              getPeerValues={getPeerValues}
              totalNetworkStake={totalNetworkStake}
            />
          )}
        </AutoSizer>
      </Box>
    </Flex>
  );
}

type TreemapTwoLevelProps = {
  /** use sorted children to help squarify produce nicer aspect ratios */
  sortedData: TrafficNode & { children: TrafficNode[] };
  width: number;
  height: number;
  getPeerValues: GetPeerValues;
  totalNetworkStake: bigint | undefined;
};

export default function TreemapTwoLevel({
  sortedData,
  width,
  height,
  totalNetworkStake,
  getPeerValues,
}: TreemapTwoLevelProps) {
  const [tooltipIdPosition, _setTooltipIdPosition] = useState<string>();
  const [hasCopied, setHasCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const setTooltipIdPosition = useCallback((id: string | undefined) => {
    _setTooltipIdPosition((prev) => {
      if (id !== prev) {
        // reset copied text when tooltip position is changed
        setHasCopied(false);
      }
      return id;
    });
  }, []);

  const copy = useCallback(
    (id: string) => {
      copyToClipboard(id);
      setHasCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setHasCopied(false), 1_000);
    },
    [setHasCopied],
  );

  useUnmount(() => {
    clearTimeout(timeoutRef.current);
  });

  const tooltipText = useMemo(
    () =>
      needsTouchScreenSupport || hasCopied
        ? "ID copied to clipboard"
        : "Click to copy ID",
    [hasCopied],
  );

  const leaves = useMemo(() => {
    const hierarchyData = hierarchy<TrafficNode>(sortedData).sum(
      (d) => d.value ?? 0,
    );

    const output = treemap<TrafficNode>();
    output.tile(squarifyTile);
    output.size([width, height]);
    output.round(true);
    output.paddingInner(2);

    return output(hierarchyData).leaves();
  }, [width, height, sortedData]);

  const colorsByIdx = useMemo(() => {
    let shuffled: string[] = [];
    const setsNeeded = Math.ceil(sortedData.children.length / colors.length);
    for (let i = 0; i < setsNeeded; i++) {
      const set = shuffle(colors);

      // make switches to prevent consecutive same colors
      const last = shuffled[shuffled.length - 1];
      if (set[0] === last) {
        set[0] = set[set.length - 1];
        set[set.length - 1] = last;
      }

      shuffled = shuffled.concat(set);
    }
    return shuffled;
  }, [sortedData]);

  return (
    <Box
      width={`${width}px`}
      height={`${height}px`}
      position="relative"
      onMouseLeave={() => setTooltipIdPosition(undefined)}
    >
      {leaves.map((leaf, i) => {
        const idPositionKey = `${leaf.data.id}-${leaf.x0}-${leaf.x1}-${leaf.y0}-${leaf.y1}`;
        const isTooltipOpen = tooltipIdPosition === idPositionKey;
        return (
          <Leaf
            key={leaf.data.id}
            leaf={leaf}
            color={colorsByIdx[i]}
            totalNetworkStake={totalNetworkStake}
            getPeerValues={getPeerValues}
            tooltipText={isTooltipOpen ? tooltipText : undefined}
            openTooltip={() => setTooltipIdPosition(idPositionKey)}
            copyId={() => copy(leaf.data.id)}
          />
        );
      })}
    </Box>
  );
}

interface LeafProps {
  leaf: HierarchyRectangularNode<TrafficNode>;
  color: string;
  totalNetworkStake: bigint | undefined;
  getPeerValues: GetPeerValues;
  tooltipText: string | undefined;
  openTooltip: () => void;
  copyId: () => void;
}

function Leaf({
  leaf,
  color,
  totalNetworkStake,
  getPeerValues,
  tooltipText,
  openTooltip,
  copyId,
}: LeafProps) {
  const leafWidth = leaf.x1 - leaf.x0;
  const leafHeight = leaf.y1 - leaf.y0;
  const stake = getPeerValues(leaf.data.id).stake;

  return (
    <Tooltip
      open={!!tooltipText}
      className={styles.tooltip}
      content={
        <Flex as="span" direction="column" gap="1">
          {leaf.data.id !== "rest" && (
            <Text>
              Epoch stake: {getFmtStake(stake) ?? "--"}
              {stake !== undefined && ` (${stake.toLocaleString()} lamports)`}.
              Percentage uses total network stake, including excluded stake.
            </Text>
          )}
          <Text>{tooltipText}</Text>
        </Flex>
      }
      disableHoverableContent
      side="bottom"
      onOpenChange={(isOpen) => {
        if (isOpen) {
          openTooltip();
        }
      }}
    >
      <Box
        onClick={copyId}
        onMouseEnter={() => {
          // for open on re-renders (desktop), and open on click (mobile)
          openTooltip();
        }}
        className={styles.leaf}
        position="absolute"
        width={`${leafWidth}px`}
        height={`${leafHeight}px`}
        style={
          {
            transform: `translate(${leaf.x0}px, ${leaf.y0}px)`,
            "--leaf-color": color,
          } as CSSProperties
        }
      >
        <LeafContent
          width={leafWidth}
          height={leafHeight}
          leaf={leaf}
          totalNetworkStake={totalNetworkStake}
          getPeerValues={getPeerValues}
        />
      </Box>
    </Tooltip>
  );
}

interface LeafContentProps {
  width: number;
  height: number;
  leaf: HierarchyRectangularNode<TrafficNode>;
  totalNetworkStake: bigint | undefined;
  getPeerValues: GetPeerValues;
}

function LeafContent({
  width,
  height,
  leaf,
  totalNetworkStake,
  getPeerValues,
}: LeafContentProps) {
  const id = leaf.data.id;
  const peerValues = getPeerValues(id);
  const text = peerValues?.name || "Private";

  const includeIcon = width >= 20 && height >= 20;
  const iconSize =
    width >= 100 && height >= 100
      ? 14
      : width >= 55 && height >= 55
        ? 12
        : width >= 32 && height >= 32
          ? 8
          : 4;

  const includeName = width >= 30 && height >= 38;
  const isNameLarge = height >= 150;

  const includeStats = height >= 60;
  const includeStakePct = width >= 82;

  return (
    <Flex
      className={styles.leafContent}
      height="100%"
      direction="column"
      align="center"
      justify="center"
      overflow="hidden"
      p={includeIcon ? "8px" : "0"}
      gap="4px"
    >
      {includeIcon && <PeerIcon url={peerValues?.iconUrl} size={iconSize} />}

      {includeName && (
        <Text
          className={clsx(styles.name, {
            [styles.large]: isNameLarge,
          })}
          truncate
          align="center"
        >
          {text}
        </Text>
      )}

      {includeStats && (
        <Flex
          className={styles.stats}
          align="center"
          justify="center"
          gap="5px"
        >
          <LeafThroughput value={leaf.value} />
          {includeStakePct && id !== "rest" && (
            <LeafStakePct
              stake={peerValues.stake}
              totalNetworkStake={totalNetworkStake}
            />
          )}
        </Flex>
      )}
    </Flex>
  );
}

interface LeafThroughputProps {
  value: number | undefined;
}
function LeafThroughput({ value }: LeafThroughputProps) {
  const throughput = formatBytesAsBits(value ?? 0);
  return (
    <Text truncate>
      {throughput.value} {throughput.unit}
    </Text>
  );
}

interface LeafStakePctProps {
  stake: bigint | undefined;
  totalNetworkStake: bigint | undefined;
}
function LeafStakePct({ stake, totalNetworkStake }: LeafStakePctProps) {
  const stakePct = useMemo(() => {
    if (
      stake === undefined ||
      totalNetworkStake === undefined ||
      totalNetworkStake === 0n
    )
      return "--";
    if (stake === 0n) return "0%";
    const pct = (100 * Number(stake)) / Number(totalNetworkStake);
    if (pct < 0.01) return "<.01%";

    return `${pct.toFixed(2)}%`;
  }, [stake, totalNetworkStake]);

  return (
    <Flex align="center" justify="center" gap="3px">
      <PieChartIcon width={8} height={8} />
      <Text truncate>{stakePct}</Text>
    </Flex>
  );
}
